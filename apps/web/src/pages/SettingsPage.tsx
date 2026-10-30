import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  TextField,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  Divider,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Switch,
  Tabs,
  Tab,
  Slider,
  Collapse,
  Checkbox,
  FormControlLabel,
  useTheme as useMuiTheme,
  alpha,
} from '@mui/material';
import {
  SettingsRounded,
  PersonRounded,
  LockRounded,
  StorageRounded,
  KeyRounded,
  DarkModeRounded,
  LightModeRounded,
  SettingsBrightnessRounded,
  CheckCircleRounded,
  ShieldRounded,
  LogoutRounded,
  LaptopRounded,
  PhoneAndroidRounded,
  SyncRounded,
  LinkRounded,
  LinkOffRounded,
  VisibilityRounded,
  VisibilityOffRounded,
  CloudDoneRounded,
  ContentCopyRounded,
  TimelineRounded,
  AddRounded,
  DeleteRounded,
  EditRounded,
  AutoAwesomeRounded,
  TuneRounded,
  LayersRounded,
  FlashOnRounded,
  TrackChangesRounded,
  SpeedRounded,
  VolumeUpRounded,
  VolumeOffRounded,
  KeyboardAltRounded,
  AccessTimeRounded,
  WarningAmberRounded,
  TrendingUpRounded,
  ExpandMoreRounded,
  ExpandLessRounded,
  CheckRounded,
  NotificationsActiveRounded,
  SendRounded,
  ScienceRounded,
  CloudSyncRounded,
  LockClockRounded,
} from '@mui/icons-material';
import {
  IInstrumentDetectionSetting,
  DEFAULT_PATTERN_DETECTION_SETTINGS,
  ILiveWatcherSettings,
  DEFAULT_LIVE_WATCHER_SETTINGS,
} from '@tradevault/shared';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { api, BASE_URL } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';

function parseUserAgent(ua?: string): { browser: string; os: string; full: string; isMobile: boolean } {
  if (!ua) return { browser: 'Unknown Browser', os: 'Unknown Device', full: 'Web Session (Unknown Device)', isMobile: false };

  let os = 'Unknown OS';
  let isMobile = false;
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/iphone|ipad|ipod/i.test(ua)) { os = 'iOS'; isMobile = true; }
  else if (/android/i.test(ua)) { os = 'Android'; isMobile = true; }
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown Browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';

  return { browser, os, full: `${browser} on ${os}`, isMobile };
}

export function SettingsPage() {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // Active Tab state (0: Live Execution, 1: Risk Guardrails, 2: Market Structure, 3: Brokers, 4: Account & Security)
  const [activeTab, setActiveTab] = useState<number>(() => {
    const p = new URLSearchParams(window.location.search).get('tab');
    if (p === 'risk') return 1;
    if (p === 'structure') return 2;
    if (p === 'brokers') return 3;
    if (p === 'account') return 4;
    return 0; // Default to Live Execution
  });

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    const tabNames = ['live', 'risk', 'structure', 'brokers', 'account'];
    const tabName = tabNames[newValue] || 'live';
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url.toString());
  };

  const [showHelpHints, setShowHelpHints] = useState(() => localStorage.getItem('tv_show_help_hints') !== 'false');
  const [showFyersDevDetails, setShowFyersDevDetails] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // =========================================================================
  // 1. LIVE TRADE WATCHER GLOBAL EXECUTION SETTINGS STATE
  // =========================================================================
  const initialWatcher = user?.liveWatcherSettings || DEFAULT_LIVE_WATCHER_SETTINGS;

  const [defaultAutoExecute, setDefaultAutoExecute] = useState(initialWatcher.defaultAutoExecute);
  const [defaultTargetMode, setDefaultTargetMode] = useState(initialWatcher.defaultTargetMode);

  // Target 1
  const [t1MultipleR, setT1MultipleR] = useState(initialWatcher.t1MultipleR);
  const [t1ExitPercent, setT1ExitPercent] = useState(Math.round(initialWatcher.t1ExitRatio * 100));
  const [t1TrailingAction, setT1TrailingAction] = useState(initialWatcher.t1TrailingAction);
  const [t1TrailPoints, setT1TrailPoints] = useState(initialWatcher.t1TrailPoints ?? 15);

  // Target 2
  const [t2Enabled, setT2Enabled] = useState(initialWatcher.t2Enabled);
  const [t2MultipleR, setT2MultipleR] = useState(initialWatcher.t2MultipleR);
  const [t2ExitPercent, setT2ExitPercent] = useState(Math.round(initialWatcher.t2ExitRatio * 100));
  const [t2TrailingAction, setT2TrailingAction] = useState(initialWatcher.t2TrailingAction);
  const [t2TrailPoints, setT2TrailPoints] = useState(initialWatcher.t2TrailPoints ?? 30);

  // Runner / Target 3
  const [isFreeRunner, setIsFreeRunner] = useState(initialWatcher.isFreeRunner);
  const [t3MultipleR, setT3MultipleR] = useState(initialWatcher.t3MultipleR);

  // Dynamic Trailing Ratchet
  const [dynamicTrailingEnabled, setDynamicTrailingEnabled] = useState(initialWatcher.dynamicTrailingEnabled);
  const [dynamicTriggerR, setDynamicTriggerR] = useState(initialWatcher.dynamicTriggerR);
  const [dynamicTrailType, setDynamicTrailType] = useState(initialWatcher.dynamicTrailType);
  const [dynamicStepR, setDynamicStepR] = useState(initialWatcher.dynamicStepR ?? 0.5);
  const [dynamicTrailPoints, setDynamicTrailPoints] = useState(initialWatcher.dynamicTrailPoints ?? 15);

  // Giveback Protection Radar
  const [givebackAutoExitEnabled, setGivebackAutoExitEnabled] = useState(initialWatcher.givebackAutoExitEnabled);
  const [givebackMinPeakR, setGivebackMinPeakR] = useState(initialWatcher.givebackMinPeakR);
  const [givebackMaxPercent, setGivebackMaxPercent] = useState(initialWatcher.givebackMaxPercent);

  // MIS Square-Off Safety
  const [misSquareOffEnabled, setMisSquareOffEnabled] = useState(initialWatcher.misSquareOffEnabled);
  const [misSquareOffTime, setMisSquareOffTime] = useState(initialWatcher.misSquareOffTime || '15:14');

  // Ergonomics & Hotkeys
  const [scalperHotkeysEnabled, setScalperHotkeysEnabled] = useState(initialWatcher.scalperHotkeysEnabled);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(initialWatcher.soundAlertsEnabled);
  const [defaultRefreshIntervalSec, setDefaultRefreshIntervalSec] = useState(initialWatcher.defaultRefreshIntervalSec);

  // Institutional Execution, Telegram Alerts & Lockout State
  const [paperExecutionMode, setPaperExecutionMode] = useState(initialWatcher.paperExecutionMode ?? false);
  const [serverSideExecutionEnabled, setServerSideExecutionEnabled] = useState(initialWatcher.serverSideExecutionEnabled ?? false);
  const [telegramAlertsEnabled, setTelegramAlertsEnabled] = useState(initialWatcher.telegramAlertsEnabled ?? false);
  const [telegramBotToken, setTelegramBotToken] = useState(initialWatcher.telegramBotToken ?? '');
  const [telegramChatId, setTelegramChatId] = useState(initialWatcher.telegramChatId ?? '');
  const [hardDisciplineLockoutEnabled, setHardDisciplineLockoutEnabled] = useState(initialWatcher.hardDisciplineLockoutEnabled ?? false);
  const [hardDisciplineLockoutDurationMins, setHardDisciplineLockoutDurationMins] = useState(initialWatcher.hardDisciplineLockoutDurationMins ?? 60);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [telegramAlertEvents, setTelegramAlertEvents] = useState({
    stopThreatCritical: true,
    givebackLeaking: true,
    dailyLossBreached: true,
    nakedPositionWarning: true,
    tokenExpiryWarning: true,
    ladderMilestoneReached: true,
    tradeOpened: true,
    tradeClosed: true,
    eodSummaryDigest: true,
    ...(initialWatcher.telegramAlertEvents || {}),
  });

  const [watcherSuccess, setWatcherSuccess] = useState(false);
  const [watcherError, setWatcherError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.liveWatcherSettings) {
      const s = user.liveWatcherSettings;
      setDefaultAutoExecute(s.defaultAutoExecute ?? false);
      setDefaultTargetMode(s.defaultTargetMode ?? 'TWO_TARGETS_RUNNER');
      setT1MultipleR(s.t1MultipleR ?? 1.0);
      setT1ExitPercent(Math.round((s.t1ExitRatio ?? 0.5) * 100));
      setT1TrailingAction(s.t1TrailingAction ?? 'TRUE_BE_WITH_FEES');
      setT1TrailPoints(s.t1TrailPoints ?? 15);
      setT2Enabled(s.t2Enabled ?? true);
      setT2MultipleR(s.t2MultipleR ?? 2.0);
      setT2ExitPercent(Math.round((s.t2ExitRatio ?? 0.25) * 100));
      setT2TrailingAction(s.t2TrailingAction ?? 'TRAIL_T1');
      setT2TrailPoints(s.t2TrailPoints ?? 30);
      setIsFreeRunner(s.isFreeRunner ?? true);
      setT3MultipleR(s.t3MultipleR ?? 3.0);
      setDynamicTrailingEnabled(s.dynamicTrailingEnabled ?? false);
      setDynamicTriggerR(s.dynamicTriggerR ?? 1.5);
      setDynamicTrailType(s.dynamicTrailType ?? 'STEP_R');
      setDynamicStepR(s.dynamicStepR ?? 0.5);
      setDynamicTrailPoints(s.dynamicTrailPoints ?? 15);
      setGivebackAutoExitEnabled(s.givebackAutoExitEnabled ?? true);
      setGivebackMinPeakR(s.givebackMinPeakR ?? 1.5);
      setGivebackMaxPercent(s.givebackMaxPercent ?? 35);
      setMisSquareOffEnabled(s.misSquareOffEnabled ?? false);
      setMisSquareOffTime(s.misSquareOffTime ?? '15:14');
      setScalperHotkeysEnabled(s.scalperHotkeysEnabled ?? true);
      setSoundAlertsEnabled(s.soundAlertsEnabled ?? true);
      setDefaultRefreshIntervalSec(s.defaultRefreshIntervalSec ?? 5);
      setPaperExecutionMode(s.paperExecutionMode ?? false);
      setServerSideExecutionEnabled(s.serverSideExecutionEnabled ?? false);
      setTelegramAlertsEnabled(s.telegramAlertsEnabled ?? false);
      setTelegramBotToken(s.telegramBotToken ?? '');
      setTelegramChatId(s.telegramChatId ?? '');
      setHardDisciplineLockoutEnabled(s.hardDisciplineLockoutEnabled ?? false);
      setHardDisciplineLockoutDurationMins(s.hardDisciplineLockoutDurationMins ?? 60);
      if (s.telegramAlertEvents) {
        setTelegramAlertEvents({
          stopThreatCritical: true,
          givebackLeaking: true,
          dailyLossBreached: true,
          nakedPositionWarning: true,
          tokenExpiryWarning: true,
          ladderMilestoneReached: true,
          tradeOpened: true,
          tradeClosed: true,
          eodSummaryDigest: true,
          ...s.telegramAlertEvents,
        });
      }
    }
  }, [user?.liveWatcherSettings]);

  const liveWatcherMutation = useMutation({
    mutationFn: (payload: ILiveWatcherSettings) => api.settings.updateProfile({ liveWatcherSettings: payload }),
    onSuccess: () => {
      refreshUser();
      localStorage.setItem('tv_scalper_hotkeys', String(scalperHotkeysEnabled));
      localStorage.setItem('tv_live_watcher_interval', String(defaultRefreshIntervalSec));
      setWatcherError(null);
      setWatcherSuccess(true);
      toast.success('Live Trade Watcher & Execution defaults saved successfully.');
      setTimeout(() => setWatcherSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update live watcher settings';
      setWatcherError(msg);
      toast.error(msg);
    },
  });

  const handleApplyPresetMode = (mode: 'T1_ONLY' | 'T1_FREE_RUNNER' | 'TWO_TARGETS_RUNNER' | 'CLASSIC_THREE') => {
    setDefaultTargetMode(mode);
    if (mode === 'TWO_TARGETS_RUNNER') {
      setT1MultipleR(1.0);
      setT1ExitPercent(50);
      setT1TrailingAction('TRUE_BE_WITH_FEES');
      setT2Enabled(true);
      setT2MultipleR(2.0);
      setT2ExitPercent(25);
      setT2TrailingAction('TRAIL_T1');
      setIsFreeRunner(true);
      setT3MultipleR(3.0);
    } else if (mode === 'T1_FREE_RUNNER') {
      setT1MultipleR(1.0);
      setT1ExitPercent(50);
      setT1TrailingAction('TRUE_BE_WITH_FEES');
      setT2Enabled(false);
      setIsFreeRunner(true);
    } else if (mode === 'T1_ONLY') {
      setT1MultipleR(1.5);
      setT1ExitPercent(100);
      setT1TrailingAction('NONE');
      setT2Enabled(false);
      setIsFreeRunner(false);
    } else if (mode === 'CLASSIC_THREE') {
      setT1MultipleR(1.0);
      setT1ExitPercent(33);
      setT1TrailingAction('TRUE_BE_WITH_FEES');
      setT2Enabled(true);
      setT2MultipleR(2.0);
      setT2ExitPercent(33);
      setT2TrailingAction('TRAIL_T1');
      setIsFreeRunner(false);
      setT3MultipleR(3.0);
    }
    toast.info(`Configured preset: ${mode.replace(/_/g, ' ')}`);
  };

  const handleResetWatcherDefaults = () => {
    const d = DEFAULT_LIVE_WATCHER_SETTINGS;
    setDefaultAutoExecute(d.defaultAutoExecute);
    setDefaultTargetMode(d.defaultTargetMode);
    setT1MultipleR(d.t1MultipleR);
    setT1ExitPercent(Math.round(d.t1ExitRatio * 100));
    setT1TrailingAction(d.t1TrailingAction);
    setT1TrailPoints(d.t1TrailPoints ?? 15);
    setT2Enabled(d.t2Enabled);
    setT2MultipleR(d.t2MultipleR);
    setT2ExitPercent(Math.round(d.t2ExitRatio * 100));
    setT2TrailingAction(d.t2TrailingAction);
    setT2TrailPoints(d.t2TrailPoints ?? 30);
    setIsFreeRunner(d.isFreeRunner);
    setT3MultipleR(d.t3MultipleR);
    setDynamicTrailingEnabled(d.dynamicTrailingEnabled);
    setDynamicTriggerR(d.dynamicTriggerR);
    setDynamicTrailType(d.dynamicTrailType);
    setDynamicStepR(d.dynamicStepR ?? 0.5);
    setDynamicTrailPoints(d.dynamicTrailPoints ?? 15);
    setGivebackAutoExitEnabled(d.givebackAutoExitEnabled);
    setGivebackMinPeakR(d.givebackMinPeakR);
    setGivebackMaxPercent(d.givebackMaxPercent);
    setMisSquareOffEnabled(d.misSquareOffEnabled);
    setMisSquareOffTime(d.misSquareOffTime);
    setScalperHotkeysEnabled(d.scalperHotkeysEnabled);
    setSoundAlertsEnabled(d.soundAlertsEnabled);
    setDefaultRefreshIntervalSec(d.defaultRefreshIntervalSec);
    setPaperExecutionMode(d.paperExecutionMode ?? false);
    setServerSideExecutionEnabled(d.serverSideExecutionEnabled ?? false);
    setTelegramAlertsEnabled(d.telegramAlertsEnabled ?? false);
    setTelegramBotToken(d.telegramBotToken ?? '');
    setTelegramChatId(d.telegramChatId ?? '');
    setHardDisciplineLockoutEnabled(d.hardDisciplineLockoutEnabled ?? false);
    setHardDisciplineLockoutDurationMins(d.hardDisciplineLockoutDurationMins ?? 60);
    setTelegramAlertEvents({
      stopThreatCritical: true,
      givebackLeaking: true,
      dailyLossBreached: true,
      nakedPositionWarning: true,
      tokenExpiryWarning: true,
      ladderMilestoneReached: true,
      tradeOpened: true,
      tradeClosed: true,
      eodSummaryDigest: true,
      ...(d.telegramAlertEvents || {}),
    });
    toast.info('Reset live watcher settings to institutional defaults. Click "Save Execution Settings" to persist.');
  };

  const handleTestTelegram = async () => {
    if (!telegramBotToken || !telegramChatId) {
      toast.error('Please enter both Telegram Bot Token and Chat ID to send a test message.');
      return;
    }
    setTestingTelegram(true);
    try {
      const res = await api.settings.testTelegram({ botToken: telegramBotToken, chatId: telegramChatId });
      if (res.success) {
        toast.success(res.message || 'Telegram test message delivered successfully!');
      } else {
        toast.error(res.error?.message || 'Failed to send test message to Telegram.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error connecting to Telegram Bot API');
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleRegisterWebhook = async () => {
    if (!telegramBotToken) {
      toast.error('Telegram Bot Token is required to configure webhook.');
      return;
    }
    const defaultUrl = `${BASE_URL}/integrations/telegram/webhook`;
    const webhookUrl = prompt(
      'Telegram Webhook endpoint URL (receives 1-tap Flatten & Panic button clicks):',
      defaultUrl
    );
    if (!webhookUrl) return;

    setRegisteringWebhook(true);
    try {
      const res = await api.settings.registerTelegramWebhook({ botToken: telegramBotToken, webhookUrl });
      if (res.success) {
        toast.success(res.message || 'Telegram Webhook registered successfully!');
      } else {
        toast.error(res.error?.message || 'Failed to configure Telegram Webhook.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error registering Telegram Webhook');
    } finally {
      setRegisteringWebhook(false);
    }
  };

  const handleWatcherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: ILiveWatcherSettings = {
      defaultAutoExecute,
      defaultTargetMode,
      t1MultipleR: Number(t1MultipleR),
      t1ExitRatio: Number(t1ExitPercent) / 100,
      t1TrailingAction,
      t1TrailPoints: Number(t1TrailPoints),
      t2Enabled,
      t2MultipleR: Number(t2MultipleR),
      t2ExitRatio: Number(t2ExitPercent) / 100,
      t2TrailingAction,
      t2TrailPoints: Number(t2TrailPoints),
      isFreeRunner,
      t3MultipleR: Number(t3MultipleR),
      dynamicTrailingEnabled,
      dynamicTriggerR: Number(dynamicTriggerR),
      dynamicTrailType,
      dynamicStepR: Number(dynamicStepR),
      dynamicTrailPoints: Number(dynamicTrailPoints),
      givebackAutoExitEnabled,
      givebackMinPeakR: Number(givebackMinPeakR),
      givebackMaxPercent: Number(givebackMaxPercent),
      misSquareOffEnabled,
      misSquareOffTime,
      scalperHotkeysEnabled,
      soundAlertsEnabled,
      defaultRefreshIntervalSec: Number(defaultRefreshIntervalSec),
      paperExecutionMode,
      serverSideExecutionEnabled,
      telegramAlertsEnabled,
      telegramBotToken,
      telegramChatId,
      telegramAlertEvents,
      hardDisciplineLockoutEnabled,
      hardDisciplineLockoutDurationMins: Number(hardDisciplineLockoutDurationMins),
    };
    liveWatcherMutation.mutate(payload);
  };

  // =========================================================================
  // 2. DISCIPLINE & RISK GUARDRAILS STATE
  // =========================================================================
  const [maxDailyLoss, setMaxDailyLoss] = useState(user?.riskSettings?.maxDailyLoss ?? 5000);
  const [maxDailyTrades, setMaxDailyTrades] = useState(user?.riskSettings?.maxDailyTrades ?? 6);
  const [maxOpenTrades, setMaxOpenTrades] = useState(user?.riskSettings?.maxOpenTrades ?? 3);
  const [maxRiskPerTradePercent, setMaxRiskPerTradePercent] = useState(user?.riskSettings?.maxRiskPerTradePercent ?? 2.0);
  const [revengeTradingMinutes, setRevengeTradingMinutes] = useState(user?.riskSettings?.revengeTradingMinutes ?? 30);
  const [riskSuccess, setRiskSuccess] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.riskSettings) {
      if (user.riskSettings.maxDailyLoss !== undefined) setMaxDailyLoss(user.riskSettings.maxDailyLoss);
      if (user.riskSettings.maxDailyTrades !== undefined) setMaxDailyTrades(user.riskSettings.maxDailyTrades);
      if (user.riskSettings.maxOpenTrades !== undefined) setMaxOpenTrades(user.riskSettings.maxOpenTrades);
      if (user.riskSettings.maxRiskPerTradePercent !== undefined) setMaxRiskPerTradePercent(user.riskSettings.maxRiskPerTradePercent);
      if (user.riskSettings.revengeTradingMinutes !== undefined) setRevengeTradingMinutes(user.riskSettings.revengeTradingMinutes);
    }
  }, [user?.riskSettings]);

  const riskMutation = useMutation({
    mutationFn: (payload: any) => api.settings.updateProfile({ riskSettings: payload }),
    onSuccess: () => {
      refreshUser();
      setRiskError(null);
      setRiskSuccess(true);
      toast.success('Discipline & risk guardrails saved successfully.');
      setTimeout(() => setRiskSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update risk guardrails';
      setRiskError(msg);
      toast.error(msg);
    },
  });

  const handleRiskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    riskMutation.mutate({
      maxDailyLoss: Number(maxDailyLoss),
      maxDailyTrades: Number(maxDailyTrades),
      maxOpenTrades: Number(maxOpenTrades),
      maxRiskPerTradePercent: Number(maxRiskPerTradePercent),
      revengeTradingMinutes: Number(revengeTradingMinutes),
    });
  };

  // =========================================================================
  // 3. MARKET STRUCTURE & PATTERN DETECTION STATE
  // =========================================================================
  const { data: userStrategies = [] } = useQuery({
    queryKey: ['strategies-active'],
    queryFn: () => api.strategies.list(),
  });

  const [defaultHtf, setDefaultHtf] = useState(user?.patternDetectionSettings?.defaultHtf || '240');
  const [defaultLtf, setDefaultLtf] = useState(user?.patternDetectionSettings?.defaultLtf || '5');
  const [autoDetectOnImport, setAutoDetectOnImport] = useState(
    user?.patternDetectionSettings?.autoDetectOnImport ?? true
  );
  const [autoDetectMistakes, setAutoDetectMistakes] = useState(
    user?.patternDetectionSettings?.autoDetectMistakes ?? true
  );
  const [instrumentOverrides, setInstrumentOverrides] = useState<IInstrumentDetectionSetting[]>(
    user?.patternDetectionSettings?.instrumentOverrides || DEFAULT_PATTERN_DETECTION_SETTINGS.instrumentOverrides
  );
  const [patternSuccess, setPatternSuccess] = useState(false);
  const [patternError, setPatternError] = useState<string | null>(null);

  // Dialog state for adding/editing instrument override
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [editingOverrideIndex, setEditingOverrideIndex] = useState<number | null>(null);
  const [overrideSymbol, setOverrideSymbol] = useState('');
  const [overrideHtf, setOverrideHtf] = useState('60');
  const [overrideLtf, setOverrideLtf] = useState('1');
  const [overridePreferredStrategyId, setOverridePreferredStrategyId] = useState('');

  useEffect(() => {
    if (user?.patternDetectionSettings) {
      if (user.patternDetectionSettings.defaultHtf) setDefaultHtf(user.patternDetectionSettings.defaultHtf);
      if (user.patternDetectionSettings.defaultLtf) setDefaultLtf(user.patternDetectionSettings.defaultLtf);
      if (user.patternDetectionSettings.autoDetectOnImport !== undefined) setAutoDetectOnImport(user.patternDetectionSettings.autoDetectOnImport);
      if (user.patternDetectionSettings.autoDetectMistakes !== undefined) setAutoDetectMistakes(user.patternDetectionSettings.autoDetectMistakes);
      if (user.patternDetectionSettings.instrumentOverrides) setInstrumentOverrides(user.patternDetectionSettings.instrumentOverrides);
    }
  }, [user?.patternDetectionSettings]);

  const patternMutation = useMutation({
    mutationFn: (payload: any) => api.settings.updateProfile({ patternDetectionSettings: payload }),
    onSuccess: () => {
      refreshUser();
      setPatternError(null);
      setPatternSuccess(true);
      toast.success('Market structure & timeframe detection settings saved.');
      setTimeout(() => setPatternSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update pattern detection settings';
      setPatternError(msg);
      toast.error(msg);
    },
  });

  const handlePatternSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    patternMutation.mutate({
      defaultHtf,
      defaultLtf,
      autoDetectOnImport,
      autoDetectMistakes,
      instrumentOverrides,
    });
  };

  const handleResetPatternDefaults = () => {
    setDefaultHtf(DEFAULT_PATTERN_DETECTION_SETTINGS.defaultHtf);
    setDefaultLtf(DEFAULT_PATTERN_DETECTION_SETTINGS.defaultLtf);
    setAutoDetectOnImport(true);
    setAutoDetectMistakes(true);
    setInstrumentOverrides(DEFAULT_PATTERN_DETECTION_SETTINGS.instrumentOverrides);
    toast.info('Reset detection settings to institutional defaults.');
  };

  const handleAddPreset = (symbol: string, htf: string, ltf: string) => {
    setInstrumentOverrides((prev) => {
      const existingIdx = prev.findIndex((o) => o.symbol.toUpperCase() === symbol.toUpperCase());
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], htf, ltf };
        return updated;
      }
      return [...prev, { symbol, htf, ltf }];
    });
    toast.success(`Preset for ${symbol} (${formatResLabel(htf)} + ${formatResLabel(ltf)}) added.`);
  };

  const handleOpenAddOverride = () => {
    setEditingOverrideIndex(null);
    setOverrideSymbol('');
    setOverrideHtf('60');
    setOverrideLtf('1');
    setOverridePreferredStrategyId('');
    setOverrideDialogOpen(true);
  };

  const handleEditOverride = (idx: number) => {
    const item = instrumentOverrides[idx];
    if (!item) return;
    setEditingOverrideIndex(idx);
    setOverrideSymbol(item.symbol);
    setOverrideHtf(item.htf);
    setOverrideLtf(item.ltf);
    setOverridePreferredStrategyId(item.preferredStrategyId || '');
    setOverrideDialogOpen(true);
  };

  const handleDeleteOverride = (idx: number) => {
    setInstrumentOverrides((prev) => prev.filter((_, i) => i !== idx));
    toast.info('Instrument override removed.');
  };

  const handleSaveOverride = () => {
    const sym = overrideSymbol.trim().toUpperCase();
    if (!sym) return;

    const strat = userStrategies.find((s: any) => String(s._id || s.id) === overridePreferredStrategyId);
    const newOverride: IInstrumentDetectionSetting = {
      symbol: sym,
      htf: overrideHtf,
      ltf: overrideLtf,
      preferredStrategyId: overridePreferredStrategyId || undefined,
      preferredStrategyName: strat?.name || undefined,
    };

    setInstrumentOverrides((prev) => {
      if (editingOverrideIndex !== null) {
        const updated = [...prev];
        updated[editingOverrideIndex] = newOverride;
        return updated;
      }
      const existingIdx = prev.findIndex((o) => o.symbol.toUpperCase() === sym);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = newOverride;
        return updated;
      }
      return [...prev, newOverride];
    });

    setOverrideDialogOpen(false);
    toast.success(`Override saved for ${sym}.`);
  };

  function formatResLabel(res: string): string {
    const map: Record<string, string> = {
      '1': '1m',
      '3': '3m',
      '5': '5m',
      '15': '15m',
      '30': '30m',
      '60': '1h',
      '240': '4h',
      'D': '1D',
    };
    return map[res] || `${res}m`;
  }

  // =========================================================================
  // 4. BROKER INTEGRATIONS (FYERS & ANGEL ONE) STATE
  // =========================================================================
  const [fyersAppId, setFyersAppId] = useState('');
  const [fyersSecretKey, setFyersSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [fyersSuccess, setFyersSuccess] = useState(false);
  const [fyersError, setFyersError] = useState<string | null>(null);

  const { data: fyersStatus } = useQuery({
    queryKey: ['fyers-status'],
    queryFn: () => api.integrations.fyersStatus(),
  });

  const fyersData = (fyersStatus as any)?.data ?? fyersStatus;
  const isFyersConfigured = Boolean(fyersData?.isConfigured || fyersData?.appId);
  const isFyersConnected = Boolean(fyersData?.isConnected);
  const fyersRedirectUri =
    fyersData?.redirectUri ||
    (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')
      ? 'https://setupmint-api.onrender.com/api/v1/integrations/fyers/callback'
      : `${window.location.origin}/api/v1/integrations/fyers/callback`);

  useEffect(() => {
    if (fyersData?.appId) {
      setFyersAppId(fyersData.appId);
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('fyers') === 'connected') {
      toast.success('FYERS broker account successfully connected! Today\'s trades synced.');
      queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('fyers') === 'error') {
      const msg = params.get('message') || 'Authentication failed';
      toast.error(`FYERS Connection: ${msg}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fyersData, queryClient]);

  const fyersConfigMutation = useMutation({
    mutationFn: (payload: { appId: string; secretKey?: string }) =>
      api.integrations.fyersConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
      setFyersError(null);
      setFyersSuccess(true);
      setFyersSecretKey('');
      toast.success('FYERS credentials saved securely.');
      setTimeout(() => setFyersSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to save FYERS configuration';
      setFyersError(msg);
      toast.error(msg);
    },
  });

  const fyersConnectMutation = useMutation({
    mutationFn: async () => {
      const needsConfig =
        Boolean(fyersAppId) &&
        (fyersAppId !== fyersData?.appId || Boolean(fyersSecretKey.trim()));
      if (needsConfig) {
        await api.integrations.fyersConfig({ appId: fyersAppId, secretKey: fyersSecretKey });
        setFyersSecretKey('');
      }
      return api.integrations.fyersLoginUrl();
    },
    onSuccess: (res: any) => {
      const url = res?.url || res?.data?.url;
      if (url) {
        toast.info('Opening FYERS login portal...');
        window.location.href = url;
      } else {
        toast.error('Unable to retrieve FYERS login portal URL.');
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to initialize FYERS login.');
    },
  });

  const fyersSyncMutation = useMutation({
    mutationFn: () => api.integrations.fyersSync(),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(res?.message || 'Synchronized trades from FYERS successfully.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to sync trades from FYERS.');
    },
  });

  const fyersDisconnectMutation = useMutation({
    mutationFn: () => api.integrations.fyersDisconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
      toast.info('FYERS broker session disconnected.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to disconnect FYERS session.');
    },
  });

  // Angel One State
  const [angelOneApiKey, setAngelOneApiKey] = useState('');
  const [angelOneClientCode, setAngelOneClientCode] = useState('');
  const [angelOnePin, setAngelOnePin] = useState('');
  const [angelOneTotp, setAngelOneTotp] = useState('');
  const [showAngelOneKey, setShowAngelOneKey] = useState(false);
  const [showAngelOnePin, setShowAngelOnePin] = useState(false);
  const [isTotpDialogOpen, setIsTotpDialogOpen] = useState(false);

  const { data: angelOneStatus, isLoading: isAngelOneLoading } = useQuery({
    queryKey: ['angel-one-status'],
    queryFn: () => api.marketData.angelOne.status(),
  });

  const angelOneData = (angelOneStatus as any)?.data ?? angelOneStatus;
  const isAngelOneConfigured = Boolean(
    angelOneData?.hasApiKey && angelOneData?.hasClientCode && angelOneData?.hasPin
  );
  const isAngelOneConnected = Boolean(angelOneData?.connected && !angelOneData?.isTokenExpired);
  const isAngelOneTokenExpired = Boolean(angelOneData?.connected && angelOneData?.isTokenExpired);

  const angelOneConfigMutation = useMutation({
    mutationFn: (payload: { apiKey: string; clientCode: string; pin: string }) =>
      api.marketData.angelOne.saveConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['angel-one-status'] });
      setAngelOnePin('');
      setAngelOneApiKey('');
      toast.success('Angel One market data credentials saved securely.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save Angel One configuration');
    },
  });

  const angelOneConnectMutation = useMutation({
    mutationFn: (totp: string) => api.marketData.angelOne.connect(totp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['angel-one-status'] });
      setAngelOneTotp('');
      setIsTotpDialogOpen(false);
      toast.success('Authenticated with Angel One SmartAPI successfully.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to authenticate with Angel One SmartAPI');
    },
  });

  const angelOneDisconnectMutation = useMutation({
    mutationFn: () => api.marketData.angelOne.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['angel-one-status'] });
      toast.info('Disconnected from Angel One SmartAPI.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to disconnect from Angel One');
    },
  });

  const angelOneDeleteMutation = useMutation({
    mutationFn: () => api.marketData.angelOne.deleteIntegration(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['angel-one-status'] });
      setAngelOneApiKey('');
      setAngelOneClientCode('');
      setAngelOnePin('');
      toast.success('Angel One integration credentials removed.');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete Angel One integration');
    },
  });

  const angelOneRefreshMutation = useMutation({
    mutationFn: (force?: boolean) => api.marketData.angelOne.refreshInstruments(force),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['angel-one-status'] });
      const count = res?.data?.cachedCount ?? res?.cachedCount;
      toast.success(`Scrip master cached: ${count ?? 'symbols'} active symbols ready.`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to refresh instrument master');
    },
  });

  // =========================================================================
  // 5. TRADER PROFILE & SECURITY STATE
  // =========================================================================
  const [name, setName] = useState(user?.name || '');
  const [baseCurrency, setBaseCurrency] = useState(user?.baseCurrency || 'INR');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: systemStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => api.settings.systemStatus(),
  });

  const { data: activeSessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.auth.sessions(),
  });

  const profileMutation = useMutation({
    mutationFn: (payload: any) => api.settings.updateProfile(payload),
    onSuccess: () => {
      refreshUser();
      setProfileError(null);
      setProfileSuccess(true);
      toast.success('Profile preferences saved successfully.');
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update profile';
      setProfileError(msg);
      toast.error(msg);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: any) => api.settings.changePassword(payload),
    onSuccess: () => {
      setPasswordMsg({ type: 'success', text: 'Password changed successfully!' });
      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordMsg(null), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update password';
      setPasswordMsg({ type: 'error', text: msg });
      toast.error(msg);
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (id: string) => api.auth.revokeSession(id),
    onSuccess: (_, id) => {
      const revoked = activeSessions.find((s) => s.id === id);
      if (revoked?.isCurrent) {
        handleLogout();
      } else {
        queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
        toast.success('Session revoked successfully.');
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to revoke session');
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => api.auth.logoutAll(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
      toast.success('All other devices have been logged out.');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to revoke other sessions');
    },
  });

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      queryClient.clear();
      toast.success('Logged out successfully.');
      navigate('/login', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Logout failed');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    profileMutation.mutate({ name, baseCurrency });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Top Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <SettingsRounded sx={{ color: 'primary.main', fontSize: 28 }} />
            Settings & Live Trading Cockpit
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure automated order execution, scaling ladders, risk guardrails, market structure detection, and broker connections
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            icon={<FlashOnRounded sx={{ fontSize: '0.9rem !important' }} />}
            label={defaultAutoExecute ? 'AUTO-EXECUTION ARMED' : 'MANUAL CONFIRMATION'}
            color={defaultAutoExecute ? 'success' : 'default'}
            size="small"
            sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
          />
          <Chip
            icon={isFyersConnected ? <CloudDoneRounded sx={{ fontSize: '0.9rem !important' }} /> : <LinkOffRounded sx={{ fontSize: '0.9rem !important' }} />}
            label={isFyersConnected ? 'FYERS LIVE' : 'FYERS OFFLINE'}
            color={isFyersConnected ? 'primary' : 'default'}
            variant="outlined"
            size="small"
            sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
          />
        </Box>
      </Box>

      {/* Modern Navigation Tabs Header */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': {
            fontWeight: 700,
            textTransform: 'none',
            fontSize: '0.875rem',
            minHeight: 46,
            gap: 1,
          },
        }}
      >
        <Tab icon={<FlashOnRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Live Cockpit & Execution" />
        <Tab icon={<ShieldRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Risk & Guardrails" />
        <Tab icon={<TimelineRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Market Structure & Routing" />
        <Tab icon={<KeyRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Broker Connections" />
        <Tab icon={<PersonRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Account & Security" />
      </Tabs>

      {/* =========================================================================
          TAB 0: LIVE COCKPIT & EXECUTION CONTROLS
          ========================================================================= */}
      {activeTab === 0 && (
        <form onSubmit={handleWatcherSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Card 1: Interactive Scaling Ladder & Target Multiples */}
          <Card variant="outlined" sx={{ p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrackChangesRounded sx={{ color: 'primary.main' }} />
                    Default Scaling Ladder & Trailing Stop Rules
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    These rules apply automatically to every open order detected from FYERS. You can customize ratios, target R-multiples, and trailing stop actions.
                  </Typography>
                </Box>

                {/* Preset Selector */}
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={defaultTargetMode}
                  onChange={(_, val) => val && handleApplyPresetMode(val)}
                  sx={{
                    '& .MuiToggleButton-root': {
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      px: 1.5,
                      textTransform: 'none',
                    },
                  }}
                >
                  <ToggleButton value="TWO_TARGETS_RUNNER">2 Targets + Runner</ToggleButton>
                  <ToggleButton value="T1_FREE_RUNNER">T1 + Free Runner</ToggleButton>
                  <ToggleButton value="CLASSIC_THREE">Classic 3 Targets</ToggleButton>
                  <ToggleButton value="T1_ONLY">T1 Only (100%)</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Visual Timeline Preview */}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Live Execution Workflow Preview for Every Open Trade:
                </Typography>

                <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Grid size={{ xs: 12, sm: 3 }}>
                    <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)', border: 1, borderColor: 'primary.main' }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', display: 'block' }}>
                        STEP 1: ENTRY (0.0R)
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Initial SL Armed
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Full position size active
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 3 }}>
                    <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)', border: 1, borderColor: '#10B981' }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#10B981', display: 'block' }}>
                        STEP 2: TARGET 1 (+{t1MultipleR}R)
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Exit {t1ExitPercent}% Position
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t1TrailingAction === 'TRUE_BE_WITH_FEES'
                          ? 'Trail SL to True BE + Fees'
                          : t1TrailingAction === 'NOMINAL_BE'
                          ? 'Trail SL to Entry Price'
                          : t1TrailingAction === 'CUSTOM_POINTS'
                          ? `Trail SL +${t1TrailPoints} pts`
                          : 'SL Unchanged'}
                      </Typography>
                    </Box>
                  </Grid>

                  {t2Enabled && (
                    <Grid size={{ xs: 12, sm: 3 }}>
                      <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.08)', border: 1, borderColor: '#8B5CF6' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#8B5CF6', display: 'block' }}>
                          STEP 3: TARGET 2 (+{t2MultipleR}R)
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Exit {t2ExitPercent}% Position
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t2TrailingAction === 'TRAIL_T1' ? `Trail SL to T1 (+${t1MultipleR}R)` : 'Trail by custom rule'}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  <Grid size={{ xs: 12, sm: t2Enabled ? 3 : 6 }}>
                    <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)', border: 1, borderColor: '#F59E0B' }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#F59E0B', display: 'block' }}>
                        STEP 4: RUNNER ({Math.max(0, 100 - t1ExitPercent - (t2Enabled ? t2ExitPercent : 0))}%)
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {isFreeRunner ? 'Free Runner Ride' : `Target 3 (+${t3MultipleR}R)`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {givebackAutoExitEnabled ? `Max ${givebackMaxPercent}% giveback radar` : 'Manual exit'}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Box>

              {/* Ladder Step Controls */}
              <Grid container spacing={2.5}>
                {/* Target 1 Controls */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip size="small" label="T1" color="primary" sx={{ fontWeight: 800, height: 20 }} />
                        Target 1 (Primary Scaling Level)
                      </Typography>
                    </Box>

                    <Grid container spacing={2}>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="Target 1 (R-Multiple)"
                          size="small"
                          fullWidth
                          type="number"
                          value={t1MultipleR}
                          onChange={(e) => setT1MultipleR(Number(e.target.value))}
                          slotProps={{ htmlInput: { step: '0.1', min: '0.5' } }}
                          helperText="e.g. +1.0R risk multiple"
                        />
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="Exit Ratio (%)"
                          size="small"
                          fullWidth
                          type="number"
                          value={t1ExitPercent}
                          onChange={(e) => setT1ExitPercent(Number(e.target.value))}
                          slotProps={{ htmlInput: { step: '5', min: '10', max: '100' } }}
                          helperText="Partial quantity exit %"
                        />
                      </Grid>

                      <Grid size={{ xs: 12 }}>
                        <TextField
                          select
                          label="Trailing Stop Action When T1 is Reached"
                          size="small"
                          fullWidth
                          value={t1TrailingAction}
                          onChange={(e) => setT1TrailingAction(e.target.value as any)}
                          helperText="Automated order adjustment sent to FYERS broker book"
                        >
                          <MenuItem value="TRUE_BE_WITH_FEES">
                            <strong>Lock True BE + Fees (Guaranteed Net Non-Negative)</strong>
                          </MenuItem>
                          <MenuItem value="NOMINAL_BE">
                            Nominal Breakeven (Exact Entry Price)
                          </MenuItem>
                          <MenuItem value="CUSTOM_POINTS">
                            Trail Stop Loss by Custom Points (+X pts)
                          </MenuItem>
                          <MenuItem value="NONE">
                            Do Not Move Stop Loss (Leave Initial Risk)
                          </MenuItem>
                        </TextField>
                      </Grid>

                      {t1TrailingAction === 'CUSTOM_POINTS' && (
                        <Grid size={{ xs: 12 }}>
                          <TextField
                            label="Trail Points Behind LTP"
                            size="small"
                            type="number"
                            fullWidth
                            value={t1TrailPoints}
                            onChange={(e) => setT1TrailPoints(Number(e.target.value))}
                          />
                        </Grid>
                      )}
                    </Grid>
                  </Box>
                </Grid>

                {/* Target 2 Controls */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip size="small" label="T2" color="secondary" sx={{ fontWeight: 800, height: 20 }} />
                        Target 2 (Secondary Milestone)
                      </Typography>
                      <Switch
                        checked={t2Enabled}
                        onChange={(e) => setT2Enabled(e.target.checked)}
                        size="small"
                      />
                    </Box>

                    {t2Enabled ? (
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 6 }}>
                          <TextField
                            label="Target 2 (R-Multiple)"
                            size="small"
                            fullWidth
                            type="number"
                            value={t2MultipleR}
                            onChange={(e) => setT2MultipleR(Number(e.target.value))}
                            slotProps={{ htmlInput: { step: '0.1', min: '1.0' } }}
                            helperText="e.g. +2.0R risk multiple"
                          />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                          <TextField
                            label="Exit Ratio (%)"
                            size="small"
                            fullWidth
                            type="number"
                            value={t2ExitPercent}
                            onChange={(e) => setT2ExitPercent(Number(e.target.value))}
                            slotProps={{ htmlInput: { step: '5', min: '5', max: '100' } }}
                            helperText="Partial quantity exit %"
                          />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                          <TextField
                            select
                            label="Trailing Stop Action When T2 is Reached"
                            size="small"
                            fullWidth
                            value={t2TrailingAction}
                            onChange={(e) => setT2TrailingAction(e.target.value as any)}
                          >
                            <MenuItem value="TRAIL_T1">Trail Stop Loss to Target 1 (+{t1MultipleR}R Locked)</MenuItem>
                            <MenuItem value="CUSTOM_POINTS">Trail Stop Loss by Custom Points</MenuItem>
                            <MenuItem value="NONE">Leave Trailing Stop at Breakeven</MenuItem>
                          </TextField>
                        </Grid>
                      </Grid>
                    ) : (
                      <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                        <Typography variant="body2">
                          Target 2 is disabled. Trades will proceed from Target 1 directly to the free runner position.
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Card 2: Auto-Execution Master Arm & Anti-Greed Giveback Radar */}
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlashOnRounded sx={{ color: defaultAutoExecute ? 'success.main' : 'text.secondary' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Master FYERS Auto-Execution Switch
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 1.5,
                      bgcolor: defaultAutoExecute
                        ? isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)'
                        : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                      border: 1,
                      borderColor: defaultAutoExecute ? 'success.main' : 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {defaultAutoExecute ? '⚡ Auto-Execution Armed Globally' : '✋ Manual Confirmation Mode'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {defaultAutoExecute
                          ? 'When a target or stop price is reached, SetupMint immediately fires partial exits and SL modifications to FYERS broker book.'
                          : 'Shows high-priority alert prompts and scalper chimes for 1-click execution without auto-firing to broker.'}
                      </Typography>
                    </Box>
                    <Switch
                      checked={defaultAutoExecute}
                      onChange={(e) => setDefaultAutoExecute(e.target.checked)}
                      color="success"
                    />
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          MIS 15:14 IST Auto-Square-Off
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Auto-exits intraday MIS trades at 15:14 IST before broker penalty fees kick in
                        </Typography>
                      </Box>
                      <Switch
                        checked={misSquareOffEnabled}
                        onChange={(e) => setMisSquareOffEnabled(e.target.checked)}
                        size="small"
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Scalper Keyboard Hotkeys
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          [B] Lock True BE • [Space] 50% Quick Exit • [K] Panic Kill Switch
                        </Typography>
                      </Box>
                      <Switch
                        checked={scalperHotkeysEnabled}
                        onChange={(e) => setScalperHotkeysEnabled(e.target.checked)}
                        size="small"
                      />
                    </Box>

                    <Divider />

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Audio Sound Alerts
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Chimes for milestone hits, stop loss threats, and automated executions
                        </Typography>
                      </Box>
                      <Switch
                        checked={soundAlertsEnabled}
                        onChange={(e) => setSoundAlertsEnabled(e.target.checked)}
                        size="small"
                      />
                    </Box>

                    <Box sx={{ pt: 1 }}>
                      <TextField
                        select
                        label="Live Watcher Refresh Interval"
                        size="small"
                        fullWidth
                        value={defaultRefreshIntervalSec}
                        onChange={(e) => setDefaultRefreshIntervalSec(Number(e.target.value))}
                        helperText="Frequency of live price polls from FYERS / Angel One"
                      >
                        <MenuItem value={1}>1 Second (Ultra-Fast Scalping)</MenuItem>
                        <MenuItem value={2}>2 Seconds (Recommended Low Latency)</MenuItem>
                        <MenuItem value={5}>5 Seconds (Balanced API Quota)</MenuItem>
                        <MenuItem value={10}>10 Seconds (Conservative Intraday)</MenuItem>
                      </TextField>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Giveback Protection Radar */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SpeedRounded sx={{ color: '#F59E0B' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Anti-Greed Unrealized Profit Giveback Radar
                      </Typography>
                    </Box>
                    <Switch
                      checked={givebackAutoExitEnabled}
                      onChange={(e) => setGivebackAutoExitEnabled(e.target.checked)}
                      size="small"
                    />
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    Prevents winning trades from turning into red days. SetupMint tracks peak unrealized profit (MFE) in real time and alerts or auto-squares off if profit retreats beyond your tolerance.
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
                    <TextField
                      label="Activation Gate (Min Peak Profit in R)"
                      size="small"
                      fullWidth
                      type="number"
                      value={givebackMinPeakR}
                      onChange={(e) => setGivebackMinPeakR(Number(e.target.value))}
                      slotProps={{ htmlInput: { step: '0.1', min: '1.0' } }}
                      helperText="Protection only activates after trade achieves at least +1.5R profit"
                    />

                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Max Giveback Tolerance
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, color: 'error.main', fontFamily: '"JetBrains Mono", monospace' }}>
                          {givebackMaxPercent}% Leak Allowed
                        </Typography>
                      </Box>
                      <Slider
                        value={givebackMaxPercent}
                        onChange={(_, val) => setGivebackMaxPercent(val as number)}
                        min={15}
                        max={60}
                        step={5}
                        marks={[
                          { value: 20, label: '20% (Tight)' },
                          { value: 35, label: '35% (Standard)' },
                          { value: 50, label: '50% (Loose)' },
                        ]}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        If a trade peaks at ₹10,000 profit and retreats to ₹{10000 * (1 - givebackMaxPercent / 100)}, the radar triggers exit prompt.
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Card 4: Institutional Server Automation, Off-Screen Alerts & Discipline Lockout */}
            <Grid size={{ xs: 12 }}>
              <Card variant="outlined" sx={{ p: 1 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <NotificationsActiveRounded sx={{ color: 'primary.main' }} />
                        Off-Screen Execution Daemon, Telegram Alerts & Hard Guardrails
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Institutional-grade safeguards: server-side automation even when your browser tab closes, Telegram push notifications, and opt-in capital preservation lockout.
                      </Typography>
                    </Box>
                  </Box>

                  <Grid container spacing={2.5}>
                    {/* Paper Execution Mode Toggle */}
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: paperExecutionMode ? 'warning.main' : 'divider', bgcolor: paperExecutionMode ? alpha('#F59E0B', 0.08) : 'transparent' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ScienceRounded sx={{ color: paperExecutionMode ? 'warning.main' : 'text.secondary', fontSize: 20 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              Paper Execution Mode (Simulation)
                            </Typography>
                          </Box>
                          <Switch
                            checked={paperExecutionMode}
                            onChange={(e) => setPaperExecutionMode(e.target.checked)}
                            color="warning"
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          When enabled, ladder steps and auto-exits will simulate in SetupMint journal without transmitting live financial orders to FYERS exchange. Great for strategy dry-runs.
                        </Typography>
                      </Box>
                    </Grid>

                    {/* Server-Side Execution Daemon Toggle */}
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: serverSideExecutionEnabled ? 'primary.main' : 'divider', bgcolor: serverSideExecutionEnabled ? alpha('#3B82F6', 0.08) : 'transparent' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CloudSyncRounded sx={{ color: serverSideExecutionEnabled ? 'primary.main' : 'text.secondary', fontSize: 20 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              Server-Side Execution Daemon
                            </Typography>
                          </Box>
                          <Switch
                            checked={serverSideExecutionEnabled}
                            onChange={(e) => setServerSideExecutionEnabled(e.target.checked)}
                            color="primary"
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Monitors positions directly on the backend server every 2 seconds. Ladder exits, trailing stops, and giveback safety triggers execute even if your laptop sleeps or your connection drops.
                        </Typography>
                      </Box>
                    </Grid>

                    {/* Hard Discipline Lockout */}
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: hardDisciplineLockoutEnabled ? 'error.main' : 'divider', bgcolor: hardDisciplineLockoutEnabled ? alpha('#EF4444', 0.08) : 'transparent' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LockClockRounded sx={{ color: hardDisciplineLockoutEnabled ? 'error.main' : 'text.secondary', fontSize: 20 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              Hard Discipline Lockout Mode
                            </Typography>
                          </Box>
                          <Switch
                            checked={hardDisciplineLockoutEnabled}
                            onChange={(e) => setHardDisciplineLockoutEnabled(e.target.checked)}
                            color="error"
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                          Opt-in hard guardrail: If daily loss limit is breached or 3 consecutive losses occur, new trade logging and entry actions are hard-locked for the cooldown window to eliminate revenge trading.
                        </Typography>
                        {hardDisciplineLockoutEnabled && (
                          <TextField
                            size="small"
                            type="number"
                            label="Lockout Cooldown (Minutes)"
                            value={hardDisciplineLockoutDurationMins}
                            onChange={(e) => setHardDisciplineLockoutDurationMins(Math.max(15, Number(e.target.value)))}
                            sx={{ width: 220 }}
                            helperText="Recommended: 45–60 mins"
                          />
                        )}
                      </Box>
                    </Grid>

                    {/* Telegram Push Alerts */}
                    <Grid size={{ xs: 12 }}>
                      <Box sx={{ p: 2.5, borderRadius: 2, border: 1, borderColor: telegramAlertsEnabled ? 'info.main' : 'divider', bgcolor: telegramAlertsEnabled ? alpha('#0284C7', 0.04) : 'transparent' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SendRounded sx={{ color: telegramAlertsEnabled ? 'info.main' : 'text.secondary', fontSize: 22 }} />
                            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                              Telegram Off-Screen Terminal & Mobile Remote Control
                            </Typography>
                          </Box>
                          <Switch
                            checked={telegramAlertsEnabled}
                            onChange={(e) => setTelegramAlertsEnabled(e.target.checked)}
                            color="info"
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                          Receive loud, real-time risk alerts and interact directly with your trading account from Telegram using inline buttons (1-tap Exit, Lock BE) and two-way chat commands (/pnl, /trades, /panic).
                        </Typography>

                        {telegramAlertsEnabled && (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            {/* Credentials and Testing */}
                            <Grid container spacing={2}>
                              <Grid size={{ xs: 12, md: 5 }}>
                                <TextField
                                  size="small"
                                  type="password"
                                  label="Telegram Bot Token"
                                  placeholder="e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                                  value={telegramBotToken}
                                  onChange={(e) => setTelegramBotToken(e.target.value)}
                                  fullWidth
                                />
                              </Grid>
                              <Grid size={{ xs: 12, md: 4 }}>
                                <TextField
                                  size="small"
                                  label="Telegram Chat ID"
                                  placeholder="e.g. 987654321"
                                  value={telegramChatId}
                                  onChange={(e) => setTelegramChatId(e.target.value)}
                                  fullWidth
                                />
                              </Grid>
                              <Grid size={{ xs: 12, md: 3 }}>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                  <Button
                                    variant="outlined"
                                    color="info"
                                    size="small"
                                    onClick={handleTestTelegram}
                                    disabled={testingTelegram || !telegramBotToken || !telegramChatId}
                                    sx={{ fontWeight: 700, flex: 1, whiteSpace: 'nowrap' }}
                                  >
                                    {testingTelegram ? 'Testing...' : 'Test Link'}
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    color="secondary"
                                    size="small"
                                    onClick={handleRegisterWebhook}
                                    disabled={registeringWebhook || !telegramBotToken}
                                    sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                                    title="Connects two-way buttons and commands to your Telegram Bot"
                                  >
                                    {registeringWebhook ? 'Configuring...' : 'Set Webhook'}
                                  </Button>
                                </Box>
                              </Grid>
                            </Grid>

                            <Divider sx={{ my: 0.5 }} />

                            {/* Event Subscriptions Toggles */}
                            <Box>
                              <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', color: 'text.secondary', display: 'block', mb: 1 }}>
                                Subscribed Push Alert Categories (All alerts sound audibly — zero silent mode)
                              </Typography>
                              <Grid container spacing={1}>
                                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={telegramAlertEvents.stopThreatCritical !== false}
                                        onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, stopThreatCritical: e.target.checked })}
                                      />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🚨 Critical Stop Threats (&lt;25% Runway)</Typography>}
                                  />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={telegramAlertEvents.givebackLeaking !== false}
                                        onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, givebackLeaking: e.target.checked })}
                                      />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600 }}>⚠️ Profit Giveback Reversals (&gt;35% Leak)</Typography>}
                                  />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={telegramAlertEvents.ladderMilestoneReached !== false}
                                        onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, ladderMilestoneReached: e.target.checked })}
                                      />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🎯 Ladder Target Met (T1, T2 Hits)</Typography>}
                                  />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={telegramAlertEvents.dailyLossBreached !== false}
                                        onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, dailyLossBreached: e.target.checked })}
                                      />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🛑 Daily Max Loss Breach & 75% Warning</Typography>}
                                  />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={telegramAlertEvents.nakedPositionWarning !== false}
                                        onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, nakedPositionWarning: e.target.checked })}
                                      />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600 }}>⚠️ Naked Positions (No Resting Exchange SL)</Typography>}
                                  />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={telegramAlertEvents.tokenExpiryWarning !== false}
                                        onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, tokenExpiryWarning: e.target.checked })}
                                      />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600 }}>⏰ 08:45 AM FYERS Token Expiry Alert</Typography>}
                                  />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={telegramAlertEvents.tradeOpened !== false}
                                        onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, tradeOpened: e.target.checked })}
                                      />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🚀 Trade Opened &amp; Synced Notice</Typography>}
                                  />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={telegramAlertEvents.tradeClosed !== false}
                                        onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, tradeClosed: e.target.checked })}
                                      />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600 }}>🏁 Trade Closed &amp; Excursion Summary</Typography>}
                                  />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                                  <FormControlLabel
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={telegramAlertEvents.eodSummaryDigest !== false}
                                        onChange={(e) => setTelegramAlertEvents({ ...telegramAlertEvents, eodSummaryDigest: e.target.checked })}
                                      />
                                    }
                                    label={<Typography variant="caption" sx={{ fontWeight: 600 }}>📊 Daily EOD Session Digest (15:35 IST)</Typography>}
                                  />
                                </Grid>
                              </Grid>
                            </Box>

                            {/* Two-Way Bot Interactive Commands Cheatsheet */}
                            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px dashed', borderColor: 'divider' }}>
                              <Typography variant="caption" sx={{ fontWeight: 800, color: 'info.main', display: 'block', mb: 0.5 }}>
                                📱 Interactive Mobile Bot Commands (Send anytime in Telegram):
                              </Typography>
                              <Grid container spacing={1}>
                                <Grid size={{ xs: 6, sm: 3 }}>
                                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>/pnl</Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>Live floating PnL, Net R &amp; Day total</Typography>
                                </Grid>
                                <Grid size={{ xs: 6, sm: 3 }}>
                                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>/trades</Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>Open positions with 1-tap Exit &amp; Lock BE</Typography>
                                </Grid>
                                <Grid size={{ xs: 6, sm: 3 }}>
                                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>/summary</Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>Today's win rate, closed trades &amp; net R</Typography>
                                </Grid>
                                <Grid size={{ xs: 6, sm: 3 }}>
                                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'error.main' }}>/panic</Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>Emergency market-exit for all positions</Typography>
                                </Grid>
                              </Grid>
                            </Box>
                          </Box>
                        )}
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {watcherSuccess && (
            <Alert severity="success" icon={<CheckCircleRounded />}>
              Live Trade Watcher & Execution defaults saved successfully. All open positions will now inherit these rules.
            </Alert>
          )}

          {watcherError && (
            <Alert severity="error" onClose={() => setWatcherError(null)}>
              {watcherError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 1 }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              disabled={liveWatcherMutation.isPending}
              sx={{ fontWeight: 700, px: 4 }}
            >
              {liveWatcherMutation.isPending ? 'Saving Execution Rules...' : 'Save Live Execution Settings'}
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleResetWatcherDefaults}
              sx={{ fontWeight: 600 }}
            >
              Reset to Institutional Defaults
            </Button>
          </Box>
        </form>
      )}

      {/* =========================================================================
          TAB 1: DISCIPLINE & RISK GUARDRAILS
          ========================================================================= */}
      {activeTab === 1 && (
        <Card variant="outlined" sx={{ p: 1 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShieldRounded sx={{ color: 'primary.main' }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Discipline & Daily Risk Guardrails
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Parameters used by the financial engine for mistake detection, revenge trade cooldowns, and daily loss warnings.
                </Typography>
              </Box>
            </Box>

            <form onSubmit={handleRiskSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Max Daily Loss Limit (₹) *"
                    type="number"
                    size="small"
                    required
                    fullWidth
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                    helperText="Critical warning banner fires across all tabs when breached"
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Max Trades Per Day *"
                    type="number"
                    size="small"
                    required
                    fullWidth
                    value={maxDailyTrades}
                    onChange={(e) => setMaxDailyTrades(Number(e.target.value))}
                    helperText="Flags overtrading beyond this threshold"
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Max Concurrent Open Positions *"
                    type="number"
                    size="small"
                    required
                    fullWidth
                    value={maxOpenTrades}
                    onChange={(e) => setMaxOpenTrades(Number(e.target.value))}
                    helperText="Max allowed simultaneous open risk exposures"
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Max Risk Per Trade (% of Capital) *"
                    type="number"
                    size="small"
                    required
                    fullWidth
                    value={maxRiskPerTradePercent}
                    onChange={(e) => setMaxRiskPerTradePercent(Number(e.target.value))}
                    helperText="Flags oversized positions as discipline mistakes"
                    slotProps={{ htmlInput: { step: '0.1', min: '0.1' } }}
                  />
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Revenge Trading Cooldown Window (Minutes) *"
                    type="number"
                    size="small"
                    required
                    fullWidth
                    value={revengeTradingMinutes}
                    onChange={(e) => setRevengeTradingMinutes(Number(e.target.value))}
                    helperText="Flags trades entered with equal or larger size within N minutes of an emotional loss"
                  />
                </Grid>
              </Grid>

              {riskSuccess && (
                <Alert severity="success" icon={<CheckCircleRounded fontSize="inherit" />}>
                  Discipline guardrails saved successfully.
                </Alert>
              )}

              {riskError && (
                <Alert severity="error" onClose={() => setRiskError(null)}>
                  {riskError}
                </Alert>
              )}

              <Box sx={{ pt: 1 }}>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={riskMutation.isPending}
                  sx={{ fontWeight: 600, px: 3 }}
                >
                  {riskMutation.isPending ? 'Saving Guardrails...' : 'Save Guardrails'}
                </Button>
              </Box>
            </form>
          </CardContent>
        </Card>
      )}

      {/* =========================================================================
          TAB 2: MARKET STRUCTURE & STRATEGY ROUTING
          ========================================================================= */}
      {activeTab === 2 && (
        <Card variant="outlined" sx={{ p: 1 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TimelineRounded sx={{ color: 'primary.main' }} />
                  Market Structure & Timeframe Detection Engine
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Institutional trend analysis, lower timeframe confirmation, and instrument-specific rules (e.g. NIFTY 1h+1m, CRUDEOIL 4h+5m).
                </Typography>
              </Box>
              <Chip
                icon={<AutoAwesomeRounded sx={{ fontSize: '1rem !important' }} />}
                label="4H Trend + 5M Confirmation Engine"
                color="primary"
                variant="outlined"
                size="small"
                sx={{ fontWeight: 600, fontFamily: '"JetBrains Mono", monospace' }}
              />
            </Box>

            <form onSubmit={handlePatternSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LayersRounded fontSize="small" sx={{ color: 'text.secondary' }} />
                  Global Timeframe Defaults (Fallback for Any Instrument)
                </Typography>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      label="Default Higher Timeframe (HTF) Trend"
                      size="small"
                      fullWidth
                      value={defaultHtf}
                      onChange={(e) => setDefaultHtf(e.target.value)}
                      helperText="Calculates institutional bias & structural trend (EMA 20/50 + swing points)"
                    >
                      <MenuItem value="60">1 Hour (60m) — Fast Intraday Trend</MenuItem>
                      <MenuItem value="240">4 Hours (240m) — Recommended Institutional Baseline</MenuItem>
                      <MenuItem value="D">Daily (1D) — Macro Swing Bias</MenuItem>
                    </TextField>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      label="Default Lower Timeframe (LTF) Confirmation"
                      size="small"
                      fullWidth
                      value={defaultLtf}
                      onChange={(e) => setDefaultLtf(e.target.value)}
                      helperText="Evaluates liquidity sweeps (EQL/EQH/W/M) and entry candlestick window"
                    >
                      <MenuItem value="1">1 Minute (1m) — Precision Scalping Confirmation</MenuItem>
                      <MenuItem value="3">3 Minutes (3m) — Fast Execution Window</MenuItem>
                      <MenuItem value="5">5 Minutes (5m) — Recommended Confirmation Baseline</MenuItem>
                      <MenuItem value="15">15 Minutes (15m) — Conservative Setup Confirmation</MenuItem>
                    </TextField>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Auto-Classify on Import & Chart Gen
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Automatically evaluate HTF trend + LTF sweep pattern on trade sync
                        </Typography>
                      </Box>
                      <Switch
                        checked={autoDetectOnImport}
                        onChange={(e) => setAutoDetectOnImport(e.target.checked)}
                        color="primary"
                      />
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Auto-Detect Execution Mistakes
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Detect counter-trend entries, missing sweeps, premature entries
                        </Typography>
                      </Box>
                      <Switch
                        checked={autoDetectMistakes}
                        onChange={(e) => setAutoDetectMistakes(e.target.checked)}
                        color="primary"
                      />
                    </Box>
                  </Grid>
                </Grid>
              </Box>

              {/* Instrument-Specific Overrides */}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TuneRounded fontSize="small" sx={{ color: 'text.secondary' }} />
                      Instrument-Specific Overrides & Strategy Routing
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Assign custom timeframes and preferred strategies to specific assets (e.g. NIFTY 1h+1m, CRUDEOIL 4h+5m).
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddRounded />}
                    onClick={() => handleOpenAddOverride()}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Add Instrument Override
                  </Button>
                </Box>

                {/* Quick Presets */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    Quick Presets:
                  </Typography>
                  <Chip
                    label="+ NIFTY (1h • 1m)"
                    size="small"
                    clickable
                    onClick={() => handleAddPreset('NIFTY', '60', '1')}
                    sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                  />
                  <Chip
                    label="+ BANKNIFTY (1h • 1m)"
                    size="small"
                    clickable
                    onClick={() => handleAddPreset('BANKNIFTY', '60', '1')}
                    sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                  />
                  <Chip
                    label="+ CRUDEOIL (4h • 5m)"
                    size="small"
                    clickable
                    onClick={() => handleAddPreset('CRUDEOIL', '240', '5')}
                    sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                  />
                  <Chip
                    label="+ GOLD (4h • 5m)"
                    size="small"
                    clickable
                    onClick={() => handleAddPreset('GOLD', '240', '5')}
                    sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                  />
                </Box>

                {/* Overrides List */}
                {instrumentOverrides.length === 0 ? (
                  <Box sx={{ py: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No instrument-specific overrides configured. All trades will use global defaults (
                      {formatResLabel(defaultHtf)} HTF + {formatResLabel(defaultLtf)} LTF).
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {instrumentOverrides.map((item, idx) => (
                      <Box
                        key={`${item.symbol}-${idx}`}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          p: 1.5,
                          borderRadius: 1.5,
                          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                          border: 1,
                          borderColor: 'divider',
                          gap: 2,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                          <Chip
                            label={item.symbol}
                            color="primary"
                            size="small"
                            sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}
                          />
                          <Chip
                            label={`HTF: ${formatResLabel(item.htf)}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontFamily: '"JetBrains Mono", monospace' }}
                          />
                          <Chip
                            label={`LTF: ${formatResLabel(item.ltf)}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontFamily: '"JetBrains Mono", monospace' }}
                          />
                          {item.preferredStrategyName ? (
                            <Chip
                              label={`Preferred: ${item.preferredStrategyName}`}
                              size="small"
                              color="info"
                              variant="outlined"
                            />
                          ) : (
                            <Chip
                              label="Dynamic Pattern Match"
                              size="small"
                              sx={{ color: 'text.secondary', bgcolor: 'transparent' }}
                            />
                          )}
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Tooltip title="Edit override">
                            <IconButton size="small" onClick={() => handleEditOverride(idx)}>
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete override">
                            <IconButton size="small" color="error" onClick={() => handleDeleteOverride(idx)}>
                              <DeleteRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>

              {patternSuccess && (
                <Alert severity="success" icon={<CheckCircleRounded fontSize="inherit" />}>
                  Market structure & timeframe detection settings saved successfully.
                </Alert>
              )}

              {patternError && (
                <Alert severity="error" onClose={() => setPatternError(null)}>
                  {patternError}
                </Alert>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 1 }}>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={patternMutation.isPending}
                  sx={{ fontWeight: 600, px: 3 }}
                >
                  {patternMutation.isPending ? 'Saving Detection Settings...' : 'Save Detection Settings'}
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={handleResetPatternDefaults}
                  sx={{ fontWeight: 600 }}
                >
                  Reset to Recommended Defaults
                </Button>
              </Box>
            </form>
          </CardContent>
        </Card>
      )}

      {/* =========================================================================
          TAB 3: BROKER & MARKET DATA CONNECTIONS
          ========================================================================= */}
      {activeTab === 3 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* FYERS Live Broker Card */}
          <Card variant="outlined" sx={{ p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <KeyRounded sx={{ color: 'primary.main' }} />
                    FYERS Broker Integration (Live API v3)
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Real-time execution, round-trip FIFO tradebook synchronization, and Indian statutory charges
                  </Typography>
                </Box>
                <Chip
                  icon={
                    isFyersConnected ? (
                      <CloudDoneRounded sx={{ fontSize: '1rem !important' }} />
                    ) : isFyersConfigured ? (
                      <LinkRounded sx={{ fontSize: '1rem !important' }} />
                    ) : (
                      <LinkOffRounded sx={{ fontSize: '1rem !important' }} />
                    )
                  }
                  label={
                    isFyersConnected
                      ? 'CONNECTED (LIVE SYNC)'
                      : isFyersConfigured
                      ? 'CONFIGURED (NEEDS DAILY LOGIN)'
                      : 'NOT CONFIGURED'
                  }
                  size="small"
                  color={isFyersConnected ? 'success' : isFyersConfigured ? 'warning' : 'default'}
                  sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                />
              </Box>

              <Alert
                severity={isFyersConnected ? 'success' : 'info'}
                sx={{ fontSize: '0.8125rem', py: 0.75 }}
              >
                {isFyersConnected ? (
                  <span>
                    <strong>Active Broker Session:</strong> Trades executed on FYERS can be fetched automatically into your journal with exact fills, fees, and auto-backfilled excursion analytics.
                  </span>
                ) : (
                  <span>
                    <strong>SEBI 24-Hour Token Rule:</strong> Broker API tokens expire daily. Click <strong>"Connect to FYERS (1-Click Daily Auth)"</strong> once per trading day to authorize SetupMint.
                  </span>
                )}
              </Alert>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={fyersData?.hasSecretKey ? 'Secret saved (encrypted)' : 'Secret not saved'}
                  color={fyersData?.hasSecretKey ? 'success' : 'default'}
                  sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
                />
                {fyersData?.clientId && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Client ${fyersData.clientId}`}
                    sx={{ fontSize: '0.6875rem', fontFamily: '"JetBrains Mono", monospace' }}
                  />
                )}
                {fyersData?.tokenExpiresAt && (
                  <Typography variant="caption" color="text.secondary">
                    Token expires: <strong>{new Date(fyersData.tokenExpiresAt).toLocaleString()}</strong>
                  </Typography>
                )}
              </Box>

              {/* Credentials Inputs */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                    FYERS App ID (Client ID)
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="e.g. YOUR_APP_ID-100"
                    value={fyersAppId}
                    onChange={(e) => setFyersAppId(e.target.value.trim())}
                    slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 } } }}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                    FYERS Secret Key
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    type={showSecretKey ? 'text' : 'password'}
                    placeholder={fyersData?.hasSecretKey ? 'Secret saved — enter new key to update' : 'Enter 32-char Secret Key'}
                    value={fyersSecretKey}
                    onChange={(e) => setFyersSecretKey(e.target.value.trim())}
                    slotProps={{
                      htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace' } },
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              onClick={() => setShowSecretKey(!showSecretKey)}
                              edge="end"
                            >
                              {showSecretKey ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
              </Grid>

              {/* Collapsible Developer Details (Cleaned up from old waste box) */}
              <Box>
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  onClick={() => setShowFyersDevDetails(!showFyersDevDetails)}
                  endIcon={showFyersDevDetails ? <ExpandLessRounded /> : <ExpandMoreRounded />}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', p: 0 }}
                >
                  {showFyersDevDetails ? 'Hide Redirect URI Details' : 'Show Registered Redirect URL for FYERS Dashboard'}
                </Button>
                <Collapse in={showFyersDevDetails}>
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                      border: 1,
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Redirect URL saved in your FYERS API Dashboard:
                      </Typography>
                      <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'primary.main' }}>
                        {fyersRedirectUri}
                      </Typography>
                    </Box>
                    <Tooltip title="Copy URL">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopyRounded fontSize="small" />}
                        onClick={() => {
                          navigator.clipboard.writeText(fyersRedirectUri);
                          toast.info('Redirect URL copied');
                        }}
                        sx={{ fontSize: '0.6875rem' }}
                      >
                        Copy
                      </Button>
                    </Tooltip>
                  </Box>
                </Collapse>
              </Box>

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', pt: 0.5 }}>
                <Button
                  variant="outlined"
                  color="inherit"
                  disabled={fyersConfigMutation.isPending || !fyersAppId}
                  onClick={() => fyersConfigMutation.mutate({ appId: fyersAppId, secretKey: fyersSecretKey })}
                  sx={{ fontWeight: 600 }}
                >
                  {fyersConfigMutation.isPending ? 'Saving...' : 'Save Credentials'}
                </Button>

                {!isFyersConnected && (
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<LinkRounded />}
                    disabled={fyersConnectMutation.isPending || !fyersAppId}
                    onClick={() => fyersConnectMutation.mutate()}
                    sx={{ fontWeight: 700 }}
                  >
                    {fyersConnectMutation.isPending ? 'Opening FYERS...' : 'Connect to FYERS (1-Click Daily Auth)'}
                  </Button>
                )}

                <Button
                  variant={isFyersConnected ? 'contained' : 'outlined'}
                  color={isFyersConnected ? 'success' : 'inherit'}
                  startIcon={
                    <SyncRounded
                      sx={{
                        animation: fyersSyncMutation.isPending ? 'spin 1s linear infinite' : 'none',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' },
                        },
                      }}
                    />
                  }
                  disabled={fyersSyncMutation.isPending || fyersConnectMutation.isPending}
                  onClick={() => {
                    if (!isFyersConnected) {
                      toast.info('FYERS session not authorized for today. Launching 1-Click Daily Auth...');
                      fyersConnectMutation.mutate();
                    } else {
                      fyersSyncMutation.mutate();
                    }
                  }}
                  sx={{ fontWeight: 700 }}
                >
                  {fyersSyncMutation.isPending ? 'Syncing...' : 'Sync FYERS Trades Now'}
                </Button>

                {isFyersConnected && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<LinkOffRounded />}
                    disabled={fyersDisconnectMutation.isPending}
                    onClick={() => fyersDisconnectMutation.mutate()}
                    sx={{ fontWeight: 600 }}
                  >
                    Disconnect
                  </Button>
                )}
              </Box>

              {fyersSuccess && (
                <Alert severity="success" icon={<CheckCircleRounded />}>
                  FYERS credentials saved securely.
                </Alert>
              )}

              {fyersError && (
                <Alert severity="error" onClose={() => setFyersError(null)}>
                  {fyersError}
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Angel One SmartAPI Market Data Fallback Card */}
          <Card variant="outlined" sx={{ p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TimelineRounded sx={{ color: '#f59e0b' }} />
                    Angel One SmartAPI (Market Data Fallback)
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Secondary candle feed for excursion analytics and chart snapshots when primary feeds are unavailable
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {isAngelOneLoading ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : isAngelOneConnected ? (
                    <Chip
                      icon={<CheckCircleRounded />}
                      label="CONNECTED & ACTIVE"
                      color="success"
                      size="small"
                      sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                    />
                  ) : isAngelOneTokenExpired ? (
                    <Chip
                      label="DAILY TOKEN EXPIRED"
                      color="warning"
                      size="small"
                      sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                    />
                  ) : isAngelOneConfigured ? (
                    <Chip
                      label="READY TO CONNECT"
                      color="info"
                      size="small"
                      sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
                    />
                  ) : (
                    <Chip
                      label="NOT CONFIGURED"
                      size="small"
                      sx={{ fontWeight: 600, fontSize: '0.6875rem' }}
                    />
                  )}
                </Box>
              </Box>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="SmartAPI Key"
                    value={angelOneApiKey}
                    onChange={(e) => setAngelOneApiKey(e.target.value)}
                    placeholder={angelOneData?.hasApiKey ? '••••••••••••••••' : 'Enter SmartAPI Key'}
                    fullWidth
                    size="small"
                    type={showAngelOneKey ? 'text' : 'password'}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowAngelOneKey(!showAngelOneKey)}>
                              {showAngelOneKey ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Client Code"
                    value={angelOneClientCode}
                    onChange={(e) => setAngelOneClientCode(e.target.value.toUpperCase().trim())}
                    placeholder={angelOneData?.clientCode || 'e.g. A123456'}
                    fullWidth
                    size="small"
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Trading PIN / MPIN"
                    value={angelOnePin}
                    onChange={(e) => setAngelOnePin(e.target.value)}
                    placeholder={angelOneData?.hasPin ? '••••' : 'Enter 4-6 digit PIN'}
                    fullWidth
                    size="small"
                    type={showAngelOnePin ? 'text' : 'password'}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowAngelOnePin(!showAngelOnePin)}>
                              {showAngelOnePin ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
              </Grid>

              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  color="inherit"
                  disabled={angelOneConfigMutation.isPending || (!angelOneApiKey && !angelOneClientCode && !angelOnePin)}
                  onClick={() =>
                    angelOneConfigMutation.mutate({
                      apiKey: angelOneApiKey,
                      clientCode: angelOneClientCode,
                      pin: angelOnePin,
                    })
                  }
                  sx={{ fontWeight: 600 }}
                >
                  {angelOneConfigMutation.isPending ? 'Saving...' : 'Save Credentials'}
                </Button>

                <Button
                  variant={isAngelOneConnected ? 'outlined' : 'contained'}
                  color="warning"
                  startIcon={<LinkRounded />}
                  disabled={angelOneConnectMutation.isPending || (!isAngelOneConfigured && !angelOneApiKey)}
                  onClick={() => setIsTotpDialogOpen(true)}
                  sx={{ fontWeight: 700 }}
                >
                  {isAngelOneConnected ? 'Re-authenticate with TOTP' : 'Connect with TOTP'}
                </Button>

                {isAngelOneConfigured && (
                  <Button
                    variant="outlined"
                    color="info"
                    startIcon={<SyncRounded />}
                    disabled={angelOneRefreshMutation.isPending}
                    onClick={() => angelOneRefreshMutation.mutate(true)}
                    sx={{ fontWeight: 600 }}
                  >
                    Refresh Instrument Cache
                  </Button>
                )}

                {isAngelOneConnected && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<LinkOffRounded />}
                    disabled={angelOneDisconnectMutation.isPending}
                    onClick={() => angelOneDisconnectMutation.mutate()}
                    sx={{ fontWeight: 600 }}
                  >
                    Disconnect
                  </Button>
                )}
              </Box>

              {angelOneData && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary">
                    Cached Instruments: <strong>{Number(angelOneData.instrumentCount ?? 0).toLocaleString()} symbols</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Quota: <strong>{angelOneData.dailyCallsUsed ?? 0} / {angelOneData.dailyBudget ?? 500} calls used today</strong>
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

      {/* =========================================================================
          TAB 4: ACCOUNT, PREFERENCES & SECURITY
          ========================================================================= */}
      {activeTab === 4 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Profile & Password Grid */}
          <Grid container spacing={2.5}>
            {/* Profile Card */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonRounded sx={{ color: 'primary.main' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Trader Profile & Preferences
                    </Typography>
                  </Box>

                  <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <TextField
                      label="Full Name *"
                      size="small"
                      required
                      fullWidth
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />

                    <TextField
                      label="Email Address"
                      size="small"
                      disabled
                      fullWidth
                      value={user?.email || ''}
                      helperText="Local database login identity (read-only)"
                      slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace' } } }}
                    />

                    <TextField
                      select
                      label="Default Base Currency"
                      size="small"
                      fullWidth
                      value={baseCurrency}
                      onChange={(e) => setBaseCurrency(e.target.value)}
                    >
                      <MenuItem value="INR">Indian Rupee (INR ₹)</MenuItem>
                      <MenuItem value="USD">US Dollar (USD $)</MenuItem>
                      <MenuItem value="EUR">Euro (EUR €)</MenuItem>
                      <MenuItem value="GBP">British Pound (GBP £)</MenuItem>
                      <MenuItem value="AED">UAE Dirham (AED)</MenuItem>
                    </TextField>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        Theme Mode
                      </Typography>
                      <ToggleButtonGroup
                        exclusive
                        fullWidth
                        size="small"
                        value={theme}
                        onChange={(_, val) => val && setTheme(val)}
                      >
                        <ToggleButton value="dark" sx={{ py: 0.75, fontWeight: 600, gap: 0.5 }}>
                          <DarkModeRounded sx={{ fontSize: 16 }} />
                          Dark
                        </ToggleButton>
                        <ToggleButton value="light" sx={{ py: 0.75, fontWeight: 600, gap: 0.5 }}>
                          <LightModeRounded sx={{ fontSize: 16 }} />
                          Light
                        </ToggleButton>
                        <ToggleButton value="system" sx={{ py: 0.75, fontWeight: 600, gap: 0.5 }}>
                          <SettingsBrightnessRounded sx={{ fontSize: 16 }} />
                          System
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Show Contextual Help Hints
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Display interactive tooltips and calculation explainers
                        </Typography>
                      </Box>
                      <Switch
                        checked={showHelpHints}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setShowHelpHints(val);
                          localStorage.setItem('tv_show_help_hints', String(val));
                          window.dispatchEvent(new Event('tv_help_hints_changed'));
                        }}
                      />
                    </Box>

                    {profileSuccess && (
                      <Alert severity="success" icon={<CheckCircleRounded />}>
                        Profile updated successfully
                      </Alert>
                    )}

                    {profileError && (
                      <Alert severity="error" onClose={() => setProfileError(null)}>
                        {profileError}
                      </Alert>
                    )}

                    <Box sx={{ pt: 1 }}>
                      <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        disabled={profileMutation.isPending}
                        sx={{ fontWeight: 600, px: 3 }}
                      >
                        {profileMutation.isPending ? 'Saving...' : 'Save Preferences'}
                      </Button>
                    </Box>
                  </form>
                </CardContent>
              </Card>
            </Grid>

            {/* Password Security Card */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ height: '100%', p: 1 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LockRounded sx={{ color: 'primary.main' }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Security & Password
                    </Typography>
                  </Box>

                  <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <TextField
                      label="Current Password *"
                      type="password"
                      size="small"
                      required
                      fullWidth
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />

                    <TextField
                      label="New Password (Min 8 chars) *"
                      type="password"
                      size="small"
                      required
                      fullWidth
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      slotProps={{ htmlInput: { minLength: 8 } }}
                    />

                    {passwordMsg && (
                      <Alert severity={passwordMsg.type === 'success' ? 'success' : 'error'}>
                        {passwordMsg.text}
                      </Alert>
                    )}

                    <Box sx={{ pt: 1 }}>
                      <Button
                        type="submit"
                        variant="outlined"
                        color="inherit"
                        disabled={passwordMutation.isPending}
                        sx={{ fontWeight: 600, px: 3 }}
                      >
                        {passwordMutation.isPending ? 'Updating...' : 'Change Password'}
                      </Button>
                    </Box>
                  </form>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Active Sessions & Devices */}
          <Card variant="outlined" sx={{ p: 1 }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ShieldRounded sx={{ color: 'primary.main' }} />
                    Active Sessions & Device Management
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Review and manage authenticated sessions
                  </Typography>
                </Box>
                {activeSessions.filter((s) => !s.isCurrent).length > 0 && (
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    disabled={logoutAllMutation.isPending}
                    onClick={() => {
                      if (window.confirm('Log out of all other devices?')) {
                        logoutAllMutation.mutate();
                      }
                    }}
                    sx={{ fontWeight: 600, textTransform: 'none' }}
                  >
                    {logoutAllMutation.isPending ? 'Logging out...' : 'Log Out All Other Devices'}
                  </Button>
                )}
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {isLoadingSessions ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                      Loading active sessions...
                    </Typography>
                  </Box>
                ) : (
                  activeSessions.map((session) => {
                    const uaInfo = parseUserAgent(session.userAgent);
                    return (
                      <Box
                        key={session.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          p: 1.25,
                          borderRadius: 1.5,
                          border: 1,
                          borderColor: session.isCurrent ? 'success.main' : 'divider',
                          bgcolor: session.isCurrent ? (isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.03)') : 'background.paper',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          {uaInfo.isMobile ? <PhoneAndroidRounded sx={{ fontSize: 20 }} /> : <LaptopRounded sx={{ fontSize: 20 }} />}
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {uaInfo.full}
                              </Typography>
                              {session.isCurrent && (
                                <Chip label="Current Device" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }} />
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.6875rem' }}>
                              IP: {session.ipAddress || 'Unknown'} • Last active: {new Date(session.lastUsedAt).toLocaleDateString()}
                            </Typography>
                          </Box>
                        </Box>

                        {!session.isCurrent && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={revokeSessionMutation.isPending}
                            onClick={() => revokeSessionMutation.mutate(session.id)}
                            sx={{ fontSize: '0.75rem', py: 0.25 }}
                          >
                            Revoke
                          </Button>
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>

              <Divider sx={{ my: 0.5 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                  startIcon={<LogoutRounded />}
                  sx={{ fontWeight: 700 }}
                >
                  {isLoggingOut ? 'Signing Out...' : 'Sign Out of Current Device'}
                </Button>

                {/* Sleek System Status Bar (Consolidated replacement for the old waste box) */}
                {(() => {
                  const sysData = (systemStatus as any)?.data || systemStatus;
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Chip
                        icon={<StorageRounded sx={{ fontSize: '0.875rem !important' }} />}
                        label={`${sysData?.tradeCount || 0} Trades Stored`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
                      />
                      <Chip
                        label={sysData?.backup?.result === 'OK' ? 'Backup Healthy' : 'Backup Checked'}
                        size="small"
                        color={sysData?.backup?.result === 'OK' ? 'success' : 'default'}
                        variant="outlined"
                        sx={{ fontSize: '0.6875rem', fontWeight: 600 }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem' }}>
                        100% Private Cloud • v1.0.0
                      </Typography>
                    </Box>
                  );
                })()}
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* TOTP Authentication Dialog for Angel One */}
      <Dialog
        open={isTotpDialogOpen}
        onClose={() => {
          setIsTotpDialogOpen(false);
          setAngelOneTotp('');
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <KeyRounded sx={{ color: '#f59e0b' }} />
          Angel One TOTP Authorization
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Enter the 6-digit TOTP code generated by your authenticator app for client code <strong>{angelOneClientCode || 'your account'}</strong>.
          </Typography>
          <TextField
            autoFocus
            label="6-Digit TOTP Code"
            value={angelOneTotp}
            onChange={(e) => setAngelOneTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            fullWidth
            slotProps={{
              htmlInput: {
                inputMode: 'numeric',
                maxLength: 6,
                style: { textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.25rem', fontWeight: 700 },
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setIsTotpDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={angelOneTotp.length !== 6 || angelOneConnectMutation.isPending}
            onClick={() => angelOneConnectMutation.mutate(angelOneTotp)}
            sx={{ fontWeight: 700 }}
          >
            {angelOneConnectMutation.isPending ? 'Verifying...' : 'Authorize'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Instrument Override Dialog */}
      <Dialog
        open={overrideDialogOpen}
        onClose={() => setOverrideDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingOverrideIndex !== null ? 'Edit Instrument Override' : 'Add Instrument Override'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Underlying Symbol *"
            size="small"
            required
            fullWidth
            placeholder="e.g. NIFTY, BANKNIFTY, CRUDEOIL"
            value={overrideSymbol}
            onChange={(e) => setOverrideSymbol(e.target.value.toUpperCase().trim())}
            slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace' } } }}
          />

          <TextField
            select
            label="Higher Timeframe (HTF) Trend"
            size="small"
            fullWidth
            value={overrideHtf}
            onChange={(e) => setOverrideHtf(e.target.value)}
          >
            <MenuItem value="60">1 Hour (60m)</MenuItem>
            <MenuItem value="240">4 Hours (240m) — Recommended</MenuItem>
            <MenuItem value="D">Daily (1D)</MenuItem>
          </TextField>

          <TextField
            select
            label="Lower Timeframe (LTF) Confirmation"
            size="small"
            fullWidth
            value={overrideLtf}
            onChange={(e) => setOverrideLtf(e.target.value)}
          >
            <MenuItem value="1">1 Minute (1m)</MenuItem>
            <MenuItem value="3">3 Minutes (3m)</MenuItem>
            <MenuItem value="5">5 Minutes (5m) — Recommended</MenuItem>
            <MenuItem value="15">15 Minutes (15m)</MenuItem>
          </TextField>

          <TextField
            select
            label="Preferred Strategy (Optional)"
            size="small"
            fullWidth
            value={overridePreferredStrategyId}
            onChange={(e) => setOverridePreferredStrategyId(e.target.value)}
          >
            <MenuItem value="">Dynamic Pattern Match (No Preference)</MenuItem>
            {userStrategies.map((strat: any) => (
              <MenuItem key={strat._id || strat.id} value={strat._id || strat.id}>
                {strat.name}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOverrideDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleSaveOverride}
            variant="contained"
            color="primary"
            disabled={!overrideSymbol.trim()}
            sx={{ fontWeight: 600 }}
          >
            Save Override
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
