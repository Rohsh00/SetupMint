import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Card,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  Tabs,
  Tab,
  useTheme as useMuiTheme,
} from '@mui/material';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import KeyRounded from '@mui/icons-material/KeyRounded';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import CloudDoneRounded from '@mui/icons-material/CloudDoneRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import TimelineRounded from '@mui/icons-material/TimelineRounded';
import FlashOnRounded from '@mui/icons-material/FlashOnRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import {
  IInstrumentDetectionSetting,
  DEFAULT_PATTERN_DETECTION_SETTINGS,
  IExcursionSettings,
  DEFAULT_EXCURSION_SETTINGS,
  ILiveWatcherSettings,
  DEFAULT_LIVE_WATCHER_SETTINGS,
  ILiveWatcherDisplaySettings,
  DEFAULT_LIVE_WATCHER_DISPLAY_SETTINGS,
  DEFAULT_TELEGRAM_FOREX_PRESETS,
} from '@tradevault/shared';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { useAccountScope } from '../context/AccountScopeContext.js';
import { api, BASE_URL } from '../lib/api.js';
import { getCurrencySymbol } from '../lib/utils.js';
import { toast } from '../context/ToastContext.js';

import { ExecutionSettingsTab } from './settings/ExecutionSettingsTab.js';
import { RiskGuardrailsTab } from './settings/RiskGuardrailsTab.js';
import { TelegramMobileTab } from './settings/TelegramMobileTab.js';
import { MarketStructureTab, formatResLabel } from './settings/MarketStructureTab.js';
import { BrokerConnectionsTab } from './settings/BrokerConnectionsTab.js';
import { ProfileSystemTab } from './settings/ProfileSystemTab.js';
import { AngelOneTotpDialog } from './settings/dialogs/AngelOneTotpDialog.js';
import { InstrumentOverrideDialog } from './settings/dialogs/InstrumentOverrideDialog.js';

export function SettingsPage() {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { accounts, selectedScopeValue, setScopeValue, personalAccounts, propAccounts, currency, activeAccount } = useAccountScope();
  const settingsCurrency = activeAccount?.baseCurrency || (currency && currency !== 'MULTI' ? currency : 'USD');
  const currSym = getCurrencySymbol(settingsCurrency);

  const hasFyersAccount = useMemo(() => {
    return accounts.some((a: any) =>
      a.broker === 'FYERS' ||
      a.profile?.executionAdapterKey === 'FYERS' ||
      a.brokerLink?.clientId
    );
  }, [accounts]);

  const hasMarketDataAccount = useMemo(() => {
    return accounts.some((a: any) =>
      a.profile?.marketRegion === 'IN' ||
      a.profile?.capabilities?.canFetchHistory ||
      a.broker === 'FYERS' ||
      a.broker === 'ZERODHA' ||
      a.broker === 'ANGEL_ONE' ||
      a.baseCurrency === 'INR'
    );
  }, [accounts]);

  const hasLiveExecutableAccount = useMemo(() => {
    return accounts.some((a: any) =>
      a.profile?.capabilities?.canExitPositions ||
      a.profile?.executionAdapterKey === 'FYERS' ||
      a.profile?.executionAdapterKey === 'ELEFIN_MT5'
    );
  }, [accounts]);

  const hasMt5Account = useMemo(() => {
    return accounts.some((a: any) =>
      a.profile?.executionAdapterKey === 'ELEFIN_MT5' ||
      a.broker === 'MT5' ||
      a.accountType === 'PROP_FIRM' ||
      a.platform === 'MT5' ||
      a.name?.toLowerCase().includes('mt5') ||
      a.name?.toLowerCase().includes('elefin') ||
      a.name?.toLowerCase().includes('the5ers')
    );
  }, [accounts]);

  // Active Tab state:
  // 0: Execution & Scaling, 1: Risk & Guardrails, 2: Telegram & Mobile,
  // 3: Market Structure, 4: Broker Connections, 5: Profile & System
  const [activeTab, setActiveTab] = useState<number>(() => {
    const p = new URLSearchParams(window.location.search).get('tab');
    if (p === 'execution' || p === 'live') return 0;
    if (p === 'risk') return 1;
    if (p === 'telegram' || p === 'mobile') return 2;
    if (p === 'structure') return 3;
    if (p === 'brokers') return 4;
    if (p === 'profile' || p === 'account') return 5;
    return 0;
  });

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    const tabNames = ['execution', 'risk', 'telegram', 'structure', 'brokers', 'profile'];
    const tabName = tabNames[newValue] || 'execution';
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url.toString());
  };

  const [showHelpHints, setShowHelpHints] = useState(() => localStorage.getItem('tv_show_help_hints') !== 'false');
  const [showFyersDevDetails, setShowFyersDevDetails] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // =========================================================================
  // 1. LIVE WATCHER & EXECUTION SETTINGS STATE
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

  // Institutional Execution & Telegram Alerts State
  const [paperExecutionMode, setPaperExecutionMode] = useState(initialWatcher.paperExecutionMode ?? false);
  const [serverSideExecutionEnabled, setServerSideExecutionEnabled] = useState(initialWatcher.serverSideExecutionEnabled ?? false);
  const [telegramAlertsEnabled, setTelegramAlertsEnabled] = useState(
    initialWatcher.telegramAlertsEnabled !== undefined
      ? initialWatcher.telegramAlertsEnabled
      : Boolean(initialWatcher.telegramBotToken && initialWatcher.telegramChatId)
  );
  const [telegramBotToken, setTelegramBotToken] = useState(initialWatcher.telegramBotToken ? '••••••••' : '');
  const [telegramChatId, setTelegramChatId] = useState(initialWatcher.telegramChatId ?? '');
  const [telegramAttachLiveChart, setTelegramAttachLiveChart] = useState(initialWatcher.telegramAttachLiveChart ?? true);
  const [telegramChartTimeframe, setTelegramChartTimeframe] = useState<string>(initialWatcher.telegramChartTimeframe || '5');
  const [slippageGuardPercent, setSlippageGuardPercent] = useState<number>(initialWatcher.slippageGuardPercent ?? 0.5);
  const [snoozeDefaultMin, setSnoozeDefaultMin] = useState<number>(initialWatcher.snoozeDefaultMin ?? 10);
  const [staleDataThresholdSeconds, setStaleDataThresholdSeconds] = useState<number>(initialWatcher.staleDataThresholdSeconds ?? 10);
  const [requireHoldToConfirm, setRequireHoldToConfirm] = useState<boolean>(initialWatcher.requireHoldToConfirm ?? true);
  const [hardDisciplineLockoutEnabled, setHardDisciplineLockoutEnabled] = useState(initialWatcher.hardDisciplineLockoutEnabled ?? false);
  const [hardDisciplineLockoutDurationMins, setHardDisciplineLockoutDurationMins] = useState(initialWatcher.hardDisciplineLockoutDurationMins ?? 60);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [sendingSampleAlert, setSendingSampleAlert] = useState(false);
  const [testingGoldNewsAlert, setTestingGoldNewsAlert] = useState(false);
  const [testingGoldNewsResultAlert, setTestingGoldNewsResultAlert] = useState(false);
  const [testingSessionAlert, setTestingSessionAlert] = useState(false);
  const [goldNewsReminderMinutes, setGoldNewsReminderMinutes] = useState(initialWatcher.goldNewsReminderMinutes ?? 15);
  const [goldNewsLeadTimesMinutes, setGoldNewsLeadTimesMinutes] = useState<number[]>(
    Array.isArray(initialWatcher.goldNewsLeadTimesMinutes) && initialWatcher.goldNewsLeadTimesMinutes.length > 0
      ? initialWatcher.goldNewsLeadTimesMinutes
      : [15, 60]
  );
  const [goldNewsImpactFilter, setGoldNewsImpactFilter] = useState<'ALL_GOLD_MOVERS' | 'HIGH_IMPACT_ONLY'>(
    initialWatcher.goldNewsImpactFilter ?? 'ALL_GOLD_MOVERS'
  );
  const [customLeadInput, setCustomLeadInput] = useState('');
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
    goldNewsReminder: true,
    goldNewsResultAlert: true,
    sessionTransition: true,
    ...(initialWatcher.telegramAlertEvents || {}),
  });

  const [displaySettings, setDisplaySettings] = useState<ILiveWatcherDisplaySettings>(() => ({
    ...DEFAULT_LIVE_WATCHER_DISPLAY_SETTINGS,
    ...(initialWatcher.displaySettings || {}),
  }));

  // Telegram MT5 Fast Execution Presets (Gold XAUUSD & Ethereum ETHUSD)
  const initialForex = initialWatcher.telegramForexPresets || DEFAULT_TELEGRAM_FOREX_PRESETS;
  const [goldDefaultLot, setGoldDefaultLot] = useState<number>(initialForex.goldDefaultLot ?? 0.10);
  const [goldSlPoints, setGoldSlPoints] = useState<number>(initialForex.goldSlPoints ?? 35);
  const [goldRrRatio, setGoldRrRatio] = useState<number>(initialForex.goldRrRatio ?? 2.0);
  const [ethDefaultLot, setEthDefaultLot] = useState<number>(initialForex.ethDefaultLot ?? 1.0);
  const [ethSlPrice, setEthSlPrice] = useState<number>(initialForex.ethSlPrice ?? 30);
  const [ethRrRatio, setEthRrRatio] = useState<number>(initialForex.ethRrRatio ?? 2.5);
  const [defaultDollarRisk, setDefaultDollarRisk] = useState<number>(initialForex.defaultDollarRisk ?? 50);
  const [restrictTelegramTradeExecution, setRestrictTelegramTradeExecution] = useState<boolean>(Boolean(initialWatcher.restrictTelegramTradeExecution));
  const [enforceTelegramOrderGuardrails, setEnforceTelegramOrderGuardrails] = useState<boolean>(
    initialWatcher.enforceTelegramOrderGuardrails ?? true
  );
  const [enforceAdaptiveDayRiskGuardrails, setEnforceAdaptiveDayRiskGuardrails] = useState<boolean>(
    initialWatcher.enforceAdaptiveDayRiskGuardrails ?? true
  );

  // Institutional Execution & Microstructure Settings
  const [executionAlgorithm, setExecutionAlgorithm] = useState<string>(
    initialWatcher.executionAlgorithm || 'PEGGED_CHASE'
  );
  const [targetDistributionMode, setTargetDistributionMode] = useState<string>(
    initialWatcher.targetDistributionMode || 'DEFENSIVE_50_30_20'
  );
  const [maxSlippagePercent, setMaxSlippagePercent] = useState<number>(
    initialWatcher.maxSlippagePercent ?? 0.05
  );
  const [maxSlippagePoints, setMaxSlippagePoints] = useState<number>(
    initialWatcher.maxSlippagePoints ?? 2
  );
  const [spreadSurgeProtectionEnabled, setSpreadSurgeProtectionEnabled] = useState<boolean>(
    initialWatcher.spreadSurgeProtectionEnabled ?? true
  );
  const [spreadSurgeMultiplier, setSpreadSurgeMultiplier] = useState<number>(
    initialWatcher.spreadSurgeMultiplier ?? 2.0
  );
  const [antiLoopProtectionEnabled, setAntiLoopProtectionEnabled] = useState<boolean>(
    initialWatcher.antiLoopProtectionEnabled ?? true
  );
  const [orderRateLimitPer5Sec, setOrderRateLimitPer5Sec] = useState<number>(
    initialWatcher.orderRateLimitPer5Sec ?? 3
  );
  const [beCushionTicks, setBeCushionTicks] = useState<number>(
    initialWatcher.beCushionTicks ?? 2
  );
  const [assetProfile, setAssetProfile] = useState<string>(
    initialWatcher.assetProfile || 'INDEX_FUTURES'
  );
  const [openingBellFreezeEnabled, setOpeningBellFreezeEnabled] = useState<boolean>(
    initialWatcher.openingBellFreezeEnabled ?? false
  );
  const [openingBellFreezeMinutes, setOpeningBellFreezeMinutes] = useState<number>(
    initialWatcher.openingBellFreezeMinutes ?? 5
  );
  const [macroNewsLockoutEnabled, setMacroNewsLockoutEnabled] = useState<boolean>(
    initialWatcher.macroNewsLockoutEnabled ?? true
  );
  const [scaleInEnabled, setScaleInEnabled] = useState<boolean>(
    initialWatcher.scaleInEnabled ?? false
  );
  const [scaleInTriggerR, setScaleInTriggerR] = useState<number>(
    initialWatcher.scaleInTriggerR ?? 1.5
  );
  const [scaleInSizePercent, setScaleInSizePercent] = useState<number>(
    initialWatcher.scaleInSizePercent ?? 25
  );
  const [scaleInCondition, setScaleInCondition] = useState<string>(
    initialWatcher.scaleInCondition || 'AFTER_TRUE_BE'
  );
  const [telegramNotifyOnAutoExecution, setTelegramNotifyOnAutoExecution] = useState<boolean>(
    initialWatcher.telegramNotifyOnAutoExecution ?? true
  );
  const [isAutoTuning, setIsAutoTuning] = useState(false);

  const [watcherSuccess, setWatcherSuccess] = useState(false);
  const [watcherError, setWatcherError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.liveWatcherSettings) {
      const s = user.liveWatcherSettings;
      if (s.displaySettings) {
        setDisplaySettings({
          ...DEFAULT_LIVE_WATCHER_DISPLAY_SETTINGS,
          ...s.displaySettings,
        });
      }
      setDefaultAutoExecute(s.defaultAutoExecute ?? false);
      setDefaultTargetMode(s.defaultTargetMode ?? 'TWO_TARGETS_RUNNER');
      if (s.executionAlgorithm) setExecutionAlgorithm(s.executionAlgorithm);
      if (s.targetDistributionMode) setTargetDistributionMode(s.targetDistributionMode);
      if (s.maxSlippagePercent !== undefined) setMaxSlippagePercent(s.maxSlippagePercent);
      if (s.maxSlippagePoints !== undefined) setMaxSlippagePoints(s.maxSlippagePoints);
      if (s.spreadSurgeProtectionEnabled !== undefined) setSpreadSurgeProtectionEnabled(s.spreadSurgeProtectionEnabled);
      if (s.spreadSurgeMultiplier !== undefined) setSpreadSurgeMultiplier(s.spreadSurgeMultiplier);
      if (s.antiLoopProtectionEnabled !== undefined) setAntiLoopProtectionEnabled(s.antiLoopProtectionEnabled);
      if (s.orderRateLimitPer5Sec !== undefined) setOrderRateLimitPer5Sec(s.orderRateLimitPer5Sec);
      if (s.beCushionTicks !== undefined) setBeCushionTicks(s.beCushionTicks);
      if (s.assetProfile) setAssetProfile(s.assetProfile);
      if (s.openingBellFreezeEnabled !== undefined) setOpeningBellFreezeEnabled(s.openingBellFreezeEnabled);
      if (s.openingBellFreezeMinutes !== undefined) setOpeningBellFreezeMinutes(s.openingBellFreezeMinutes);
      if (s.macroNewsLockoutEnabled !== undefined) setMacroNewsLockoutEnabled(s.macroNewsLockoutEnabled);
      if (s.scaleInEnabled !== undefined) setScaleInEnabled(s.scaleInEnabled);
      if (s.scaleInTriggerR !== undefined) setScaleInTriggerR(s.scaleInTriggerR);
      if (s.scaleInSizePercent !== undefined) setScaleInSizePercent(s.scaleInSizePercent);
      if (s.scaleInCondition) setScaleInCondition(s.scaleInCondition);
      if (s.telegramNotifyOnAutoExecution !== undefined) setTelegramNotifyOnAutoExecution(s.telegramNotifyOnAutoExecution);
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
      const hasCreds = Boolean(s.telegramBotToken && s.telegramChatId);
      setTelegramAlertsEnabled(s.telegramAlertsEnabled !== undefined ? s.telegramAlertsEnabled : hasCreds);
      setTelegramBotToken(s.telegramBotToken ? '••••••••' : '');
      setTelegramChatId(s.telegramChatId ?? '');
      setTelegramAttachLiveChart(s.telegramAttachLiveChart ?? true);
      setTelegramChartTimeframe(s.telegramChartTimeframe || '5');
      setSlippageGuardPercent(s.slippageGuardPercent ?? 0.5);
      setSnoozeDefaultMin(s.snoozeDefaultMin ?? 10);
      setStaleDataThresholdSeconds(s.staleDataThresholdSeconds ?? 10);
      setRequireHoldToConfirm(s.requireHoldToConfirm ?? true);
      setHardDisciplineLockoutEnabled(s.hardDisciplineLockoutEnabled ?? false);
      setHardDisciplineLockoutDurationMins(s.hardDisciplineLockoutDurationMins ?? 60);
      if (s.goldNewsReminderMinutes !== undefined) {
        setGoldNewsReminderMinutes(s.goldNewsReminderMinutes);
      }
      if (Array.isArray(s.goldNewsLeadTimesMinutes) && s.goldNewsLeadTimesMinutes.length > 0) {
        setGoldNewsLeadTimesMinutes(s.goldNewsLeadTimesMinutes);
      } else if (s.goldNewsReminderMinutes !== undefined) {
        setGoldNewsLeadTimesMinutes([s.goldNewsReminderMinutes]);
      }
      if (s.goldNewsImpactFilter) {
        setGoldNewsImpactFilter(s.goldNewsImpactFilter);
      }
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
          goldNewsReminder: s.telegramAlertEvents?.goldNewsReminder ?? true,
          goldNewsResultAlert: s.telegramAlertEvents?.goldNewsResultAlert ?? true,
          sessionTransition: s.telegramAlertEvents?.sessionTransition ?? true,
        });
      }
      if (s.telegramForexPresets) {
        if (s.telegramForexPresets.goldDefaultLot !== undefined) setGoldDefaultLot(s.telegramForexPresets.goldDefaultLot);
        if (s.telegramForexPresets.goldSlPoints !== undefined) setGoldSlPoints(s.telegramForexPresets.goldSlPoints);
        if (s.telegramForexPresets.goldRrRatio !== undefined) setGoldRrRatio(s.telegramForexPresets.goldRrRatio);
        if (s.telegramForexPresets.ethDefaultLot !== undefined) setEthDefaultLot(s.telegramForexPresets.ethDefaultLot);
        if (s.telegramForexPresets.ethSlPrice !== undefined) setEthSlPrice(s.telegramForexPresets.ethSlPrice);
        if (s.telegramForexPresets.ethRrRatio !== undefined) setEthRrRatio(s.telegramForexPresets.ethRrRatio);
        if (s.telegramForexPresets.defaultDollarRisk !== undefined) setDefaultDollarRisk(s.telegramForexPresets.defaultDollarRisk);
      }
      if (s.restrictTelegramTradeExecution !== undefined) {
        setRestrictTelegramTradeExecution(Boolean(s.restrictTelegramTradeExecution));
      }
      if (s.enforceTelegramOrderGuardrails !== undefined) {
        setEnforceTelegramOrderGuardrails(Boolean(s.enforceTelegramOrderGuardrails));
      }
      if (s.enforceAdaptiveDayRiskGuardrails !== undefined) {
        setEnforceAdaptiveDayRiskGuardrails(Boolean(s.enforceAdaptiveDayRiskGuardrails));
      }
    }
  }, [user?.liveWatcherSettings]);

  const liveWatcherMutation = useMutation({
    mutationFn: (payload: ILiveWatcherSettings) => api.settings.updateProfile({ liveWatcherSettings: payload }),
    onSuccess: () => {
      refreshUser();
      localStorage.setItem('tv_scalper_hotkeys', String(scalperHotkeysEnabled));
      localStorage.setItem('tv_live_watcher_interval', String(defaultRefreshIntervalSec));
      localStorage.setItem('tv_live_watcher_display_settings', JSON.stringify(displaySettings));
      setWatcherError(null);
      setWatcherSuccess(true);
      toast.success('Settings saved successfully.');
      setTimeout(() => setWatcherSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to update settings';
      setWatcherError(msg);
      toast.error(msg);
    },
  });

  const handleApplyPresetMode = (mode: string) => {
    setDefaultTargetMode(mode as any);
    setTargetDistributionMode(mode);
    if (mode === 'DEFENSIVE_50_30_20' || mode === 'TWO_TARGETS_RUNNER') {
      setDefaultTargetMode('TWO_TARGETS_RUNNER');
      setTargetDistributionMode('DEFENSIVE_50_30_20');
      setT1MultipleR(1.0);
      setT1ExitPercent(50);
      setT1TrailingAction('TRUE_BE_WITH_FEES');
      setT2Enabled(true);
      setT2MultipleR(2.0);
      setT2ExitPercent(30);
      setT2TrailingAction('TRAIL_T1');
      setIsFreeRunner(true);
      setT3MultipleR(3.0);
    } else if (mode === 'CONVEX_20_30_50') {
      setDefaultTargetMode('TWO_TARGETS_RUNNER');
      setTargetDistributionMode('CONVEX_20_30_50');
      setT1MultipleR(1.0);
      setT1ExitPercent(20);
      setT1TrailingAction('TRUE_BE_WITH_FEES');
      setT2Enabled(true);
      setT2MultipleR(2.5);
      setT2ExitPercent(30);
      setT2TrailingAction('TRAIL_T1');
      setIsFreeRunner(true);
      setT3MultipleR(3.5);
    } else if (mode === 'EQUAL_SPLIT' || mode === 'CLASSIC_THREE') {
      setDefaultTargetMode('CLASSIC_THREE');
      setTargetDistributionMode('EQUAL_SPLIT');
      setT1MultipleR(1.0);
      setT1ExitPercent(33);
      setT1TrailingAction('TRUE_BE_WITH_FEES');
      setT2Enabled(true);
      setT2MultipleR(2.0);
      setT2ExitPercent(33);
      setT2TrailingAction('TRAIL_T1');
      setIsFreeRunner(false);
      setT3MultipleR(3.0);
    } else if (mode === 'T1_FREE_RUNNER') {
      setT1MultipleR(1.0);
      setT1ExitPercent(50);
      setT1TrailingAction('TRUE_BE_WITH_FEES');
      setT2Enabled(false);
      setIsFreeRunner(true);
      setTargetDistributionMode('CUSTOM');
    } else if (mode === 'T1_ONLY') {
      setT1MultipleR(1.5);
      setT1ExitPercent(100);
      setT1TrailingAction('NOMINAL_BE');
      setT2Enabled(false);
      setIsFreeRunner(false);
      setTargetDistributionMode('T1_ONLY');
    }
    toast.info(`Configured preset: ${mode.replace(/_/g, ' ')}`);
  };

  const handleResetWatcherDefaults = () => {
    const d = DEFAULT_LIVE_WATCHER_SETTINGS;
    setDefaultAutoExecute(d.defaultAutoExecute);
    setDefaultTargetMode(d.defaultTargetMode);
    setExecutionAlgorithm(d.executionAlgorithm ?? 'PEGGED_CHASE');
    setTargetDistributionMode(d.targetDistributionMode ?? 'DEFENSIVE_50_30_20');
    setMaxSlippagePercent(d.maxSlippagePercent ?? 0.05);
    setMaxSlippagePoints(d.maxSlippagePoints ?? 2);
    setSpreadSurgeProtectionEnabled(d.spreadSurgeProtectionEnabled ?? true);
    setSpreadSurgeMultiplier(d.spreadSurgeMultiplier ?? 2.0);
    setAntiLoopProtectionEnabled(d.antiLoopProtectionEnabled ?? true);
    setOrderRateLimitPer5Sec(d.orderRateLimitPer5Sec ?? 3);
    setBeCushionTicks(d.beCushionTicks ?? 2);
    setAssetProfile(d.assetProfile ?? 'INDEX_FUTURES');
    setOpeningBellFreezeEnabled(d.openingBellFreezeEnabled ?? false);
    setOpeningBellFreezeMinutes(d.openingBellFreezeMinutes ?? 5);
    setMacroNewsLockoutEnabled(d.macroNewsLockoutEnabled ?? true);
    setScaleInEnabled(d.scaleInEnabled ?? false);
    setScaleInTriggerR(d.scaleInTriggerR ?? 1.5);
    setScaleInSizePercent(d.scaleInSizePercent ?? 25);
    setScaleInCondition(d.scaleInCondition ?? 'AFTER_TRUE_BE');
    setTelegramNotifyOnAutoExecution(d.telegramNotifyOnAutoExecution ?? true);
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
    setStaleDataThresholdSeconds(d.staleDataThresholdSeconds ?? 10);
    setRequireHoldToConfirm(d.requireHoldToConfirm ?? true);
    setHardDisciplineLockoutEnabled(d.hardDisciplineLockoutEnabled ?? false);
    setHardDisciplineLockoutDurationMins(d.hardDisciplineLockoutDurationMins ?? 60);
    setGoldNewsReminderMinutes(15);
    setGoldNewsLeadTimesMinutes([15, 60]);
    setGoldNewsImpactFilter('ALL_GOLD_MOVERS');
    setGoldDefaultLot(DEFAULT_TELEGRAM_FOREX_PRESETS.goldDefaultLot);
    setGoldSlPoints(DEFAULT_TELEGRAM_FOREX_PRESETS.goldSlPoints);
    setGoldRrRatio(DEFAULT_TELEGRAM_FOREX_PRESETS.goldRrRatio);
    setEthDefaultLot(DEFAULT_TELEGRAM_FOREX_PRESETS.ethDefaultLot);
    setEthSlPrice(DEFAULT_TELEGRAM_FOREX_PRESETS.ethSlPrice);
    setEthRrRatio(DEFAULT_TELEGRAM_FOREX_PRESETS.ethRrRatio);
    setDefaultDollarRisk(DEFAULT_TELEGRAM_FOREX_PRESETS.defaultDollarRisk);
    setRestrictTelegramTradeExecution(false);
    setEnforceTelegramOrderGuardrails(true);
    setEnforceAdaptiveDayRiskGuardrails(true);
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
      goldNewsReminder: d.telegramAlertEvents?.goldNewsReminder ?? true,
      goldNewsResultAlert: d.telegramAlertEvents?.goldNewsResultAlert ?? true,
      sessionTransition: d.telegramAlertEvents?.sessionTransition ?? true,
    });
    setDisplaySettings({ ...DEFAULT_LIVE_WATCHER_DISPLAY_SETTINGS });
    toast.info('Reset live watcher settings to institutional defaults. Click "Save" to persist.');
  };

  const handleApplyAssetProfile = (profile: string) => {
    setAssetProfile(profile);
    if (profile === 'INDEX_FUTURES') {
      setExecutionAlgorithm('PEGGED_CHASE');
      setMaxSlippagePercent(0.05);
      setMaxSlippagePoints(2);
      setBeCushionTicks(2);
      setSpreadSurgeMultiplier(2.0);
      setSpreadSurgeProtectionEnabled(true);
      setOpeningBellFreezeEnabled(true);
      setOpeningBellFreezeMinutes(5);
      setTargetDistributionMode('DEFENSIVE_50_30_20');
      handleApplyPresetMode('DEFENSIVE_50_30_20');
      setMisSquareOffEnabled(true);
      setMisSquareOffTime('15:14');
      toast.info('🏛️ Applied Index Futures & Options Profile (Pegged Chase, 50/30/20, 2T Cushion, 5m Open Freeze)');
    } else if (profile === 'FOREX_COMMODITIES') {
      setExecutionAlgorithm('PEGGED_CHASE');
      setMaxSlippagePercent(0.08);
      setMaxSlippagePoints(4);
      setBeCushionTicks(4);
      setSpreadSurgeMultiplier(2.5);
      setSpreadSurgeProtectionEnabled(true);
      setOpeningBellFreezeEnabled(false);
      setTargetDistributionMode('EQUAL_SPLIT');
      handleApplyPresetMode('EQUAL_SPLIT');
      setDynamicTrailingEnabled(true);
      setDynamicTrailType('HIGH_WATER_POINTS');
      setDynamicTrailPoints(30);
      setMisSquareOffEnabled(false);
      toast.info('🌐 Applied Forex & Commodities Profile (High-Water Trail, 4T Cushion, 2.5x Surge Cap)');
    } else if (profile === 'CRYPTO_EQUITIES') {
      setExecutionAlgorithm('TWAP_SLICING');
      setMaxSlippagePercent(0.15);
      setMaxSlippagePoints(5);
      setBeCushionTicks(3);
      setSpreadSurgeMultiplier(3.0);
      setSpreadSurgeProtectionEnabled(true);
      setOpeningBellFreezeEnabled(false);
      setTargetDistributionMode('CONVEX_20_30_50');
      handleApplyPresetMode('CONVEX_20_30_50');
      setDynamicTrailingEnabled(true);
      setDynamicTrailType('STEP_R');
      setDynamicStepR(0.5);
      setMisSquareOffEnabled(false);
      toast.info('🚀 Applied Crypto & Growth Equities Profile (TWAP Slicing, Convex 20/30/50, Step-R Ratchet)');
    }
  };

  const handleAutoTuneFromAnalytics = async () => {
    try {
      setIsAutoTuning(true);
      const res = await api.analytics.summary();
      const rep = res.data?.data || res.data || res;
      const card = rep?.scorecard;

      setT1MultipleR(1.2);
      setT1TrailingAction('TRUE_BE_WITH_FEES');
      setBeCushionTicks(2);
      setTargetDistributionMode('DEFENSIVE_50_30_20');
      handleApplyPresetMode('DEFENSIVE_50_30_20');
      setGivebackAutoExitEnabled(true);
      setGivebackMinPeakR(1.5);
      setGivebackMaxPercent(30);
      setSpreadSurgeProtectionEnabled(true);
      setAntiLoopProtectionEnabled(true);
      setOpeningBellFreezeEnabled(true);
      setOpeningBellFreezeMinutes(5);

      if (card?.totalClosedTrades) {
        toast.success(`✨ Auto-Calibrated Cockpit with empirical edge rules from ${card.totalClosedTrades} trades!`);
      } else {
        toast.success('✨ Auto-Calibrated Cockpit with institutional high-winrate baseline (True BE + 50/30/20)!');
      }
    } catch {
      toast.info('✨ Applied institutional high-winrate baseline (True BE + 50/30/20 + Giveback Radar)');
    } finally {
      setIsAutoTuning(false);
    }
  };

  const handleTestTelegram = async () => {
    const tokenToTest = telegramBotToken || user?.liveWatcherSettings?.telegramBotToken;
    if (!tokenToTest || !telegramChatId) {
      toast.error('Please enter both Telegram Bot Token and Chat ID to send a test message.');
      return;
    }
    setTestingTelegram(true);
    try {
      const res = await api.settings.testTelegram({ botToken: tokenToTest, chatId: telegramChatId });
      if (res.success) {
        setTelegramAlertsEnabled(true);
        refreshUser();
        toast.success(res.message || 'Telegram test message delivered successfully! Interactive buttons armed.');
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
    const tokenToUse = telegramBotToken || user?.liveWatcherSettings?.telegramBotToken;
    if (!tokenToUse) {
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
      const res = await api.settings.registerTelegramWebhook({ botToken: tokenToUse, webhookUrl });
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

  const handleClearTelegramCredentials = () => {
    if (!window.confirm('Are you sure you want to disconnect Telegram and clear stored credentials?')) return;
    setTelegramBotToken('');
    setTelegramChatId('');
    setTelegramAlertsEnabled(false);
    liveWatcherMutation.mutate({
      clearTelegramCredentials: true,
      telegramAlertsEnabled: false,
      telegramBotToken: '',
      telegramChatId: '',
    } as any);
    toast.info('Telegram credentials cleared.');
  };

  const handleSendSampleAlert = async () => {
    setSendingSampleAlert(true);
    try {
      const res = await api.settings.sampleTelegramAlert();
      if (res.success) {
        toast.success(res.message || 'Sample CRITICAL terminal card alert dispatched to Telegram!');
      } else {
        toast.error(res.message || 'Failed to dispatch sample alert.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error dispatching sample alert');
    } finally {
      setSendingSampleAlert(false);
    }
  };

  const handleTestGoldNewsAlert = async () => {
    const tokenToTest = telegramBotToken || user?.liveWatcherSettings?.telegramBotToken;
    const chatIdToTest = telegramChatId || user?.liveWatcherSettings?.telegramChatId;
    if (!tokenToTest || !chatIdToTest) {
      toast.error('Please configure and test your Telegram Bot Token and Chat ID first.');
      return;
    }
    setTestingGoldNewsAlert(true);
    try {
      const res = await api.settings.testGoldNewsAlert();
      if (res.success) {
        toast.success(res.message || 'Gold (XAUUSD) catalyst alert delivered to Telegram!');
      } else {
        toast.error(res.error?.message || 'Failed to send Gold alert to Telegram.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error delivering Gold alert to Telegram.');
    } finally {
      setTestingGoldNewsAlert(false);
    }
  };

  const handleTestGoldNewsResultAlert = async () => {
    const tokenToTest = telegramBotToken || user?.liveWatcherSettings?.telegramBotToken;
    const chatIdToTest = telegramChatId || user?.liveWatcherSettings?.telegramChatId;
    if (!tokenToTest || !chatIdToTest) {
      toast.error('Please configure and test your Telegram Bot Token and Chat ID first.');
      return;
    }
    setTestingGoldNewsResultAlert(true);
    try {
      const res = await api.settings.testGoldNewsResultAlert();
      if (res.success) {
        toast.success(res.message || 'Sample Gold Macro News Result flash delivered to Telegram!');
      } else {
        toast.error(res.error?.message || 'Failed to send Gold news result flash to Telegram.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error delivering Gold news result flash to Telegram.');
    } finally {
      setTestingGoldNewsResultAlert(false);
    }
  };

  const handleTestSessionAlert = async () => {
    const tokenToTest = telegramBotToken || user?.liveWatcherSettings?.telegramBotToken;
    const chatIdToTest = telegramChatId || user?.liveWatcherSettings?.telegramChatId;
    if (!tokenToTest || !chatIdToTest) {
      toast.error('Please configure and test your Telegram Bot Token and Chat ID first.');
      return;
    }
    setTestingSessionAlert(true);
    try {
      const res = await api.settings.testSessionAlert();
      if (res.success) {
        toast.success(res.message || 'Market session transition notification delivered to Telegram!');
      } else {
        toast.error(res.error?.message || 'Failed to send session alert to Telegram.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error dispatching session alert');
    } finally {
      setTestingSessionAlert(false);
    }
  };

  const handleWatcherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveBotToken = telegramBotToken.trim() !== ''
      ? telegramBotToken.trim()
      : (user?.liveWatcherSettings?.telegramBotToken ? '••••••••' : undefined);
    const effectiveChatId = telegramChatId.trim() !== ''
      ? telegramChatId.trim()
      : (user?.liveWatcherSettings?.telegramChatId || undefined);

    const effectiveAlertsEnabled = telegramAlertsEnabled || Boolean(
      telegramBotToken.trim() !== '' &&
      !telegramBotToken.startsWith('••') &&
      effectiveChatId &&
      !user?.liveWatcherSettings?.telegramBotToken
    );

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
      executionAlgorithm: executionAlgorithm as any,
      targetDistributionMode: targetDistributionMode as any,
      maxSlippagePercent: Number(maxSlippagePercent),
      maxSlippagePoints: Number(maxSlippagePoints),
      spreadSurgeProtectionEnabled: Boolean(spreadSurgeProtectionEnabled),
      spreadSurgeMultiplier: Number(spreadSurgeMultiplier),
      antiLoopProtectionEnabled: Boolean(antiLoopProtectionEnabled),
      orderRateLimitPer5Sec: Number(orderRateLimitPer5Sec),
      beCushionTicks: Number(beCushionTicks),
      assetProfile: assetProfile as any,
      openingBellFreezeEnabled: Boolean(openingBellFreezeEnabled),
      openingBellFreezeMinutes: Number(openingBellFreezeMinutes),
      macroNewsLockoutEnabled: Boolean(macroNewsLockoutEnabled),
      scaleInEnabled: Boolean(scaleInEnabled),
      scaleInTriggerR: Number(scaleInTriggerR),
      scaleInSizePercent: Number(scaleInSizePercent),
      scaleInCondition: scaleInCondition as any,
      telegramNotifyOnAutoExecution: Boolean(telegramNotifyOnAutoExecution),
      telegramAlertsEnabled: effectiveAlertsEnabled,
      telegramBotToken: effectiveBotToken,
      telegramChatId: effectiveChatId,
      telegramAttachLiveChart,
      telegramChartTimeframe,
      telegramAlertEvents,
      goldNewsReminderMinutes: Number(goldNewsReminderMinutes),
      goldNewsLeadTimesMinutes,
      goldNewsImpactFilter,
      slippageGuardPercent: Number(slippageGuardPercent),
      snoozeDefaultMin: Number(snoozeDefaultMin),
      staleDataThresholdSeconds: Number(staleDataThresholdSeconds),
      requireHoldToConfirm,
      hardDisciplineLockoutEnabled,
      hardDisciplineLockoutDurationMins: Number(hardDisciplineLockoutDurationMins),
      restrictTelegramTradeExecution: Boolean(restrictTelegramTradeExecution),
      enforceTelegramOrderGuardrails: Boolean(enforceTelegramOrderGuardrails),
      enforceAdaptiveDayRiskGuardrails: Boolean(enforceAdaptiveDayRiskGuardrails),
      displaySettings,
      telegramForexPresets: {
        goldDefaultLot: Number(goldDefaultLot),
        goldSlPoints: Number(goldSlPoints),
        goldRrRatio: Number(goldRrRatio),
        ethDefaultLot: Number(ethDefaultLot),
        ethSlPrice: Number(ethSlPrice),
        ethRrRatio: Number(ethRrRatio),
        defaultDollarRisk: Number(defaultDollarRisk),
      },
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
      // Also persist the hard lockout & remote guardrail policies alongside risk settings
      liveWatcherMutation.mutate({
        ...user?.liveWatcherSettings,
        hardDisciplineLockoutEnabled,
        hardDisciplineLockoutDurationMins: Number(hardDisciplineLockoutDurationMins),
        enforceTelegramOrderGuardrails: Boolean(enforceTelegramOrderGuardrails),
        enforceAdaptiveDayRiskGuardrails: Boolean(enforceAdaptiveDayRiskGuardrails),
      } as any);
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
  const [excursionSettings, setExcursionSettings] = useState<IExcursionSettings>(
    user?.patternDetectionSettings?.excursionSettings || DEFAULT_EXCURSION_SETTINGS
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
      if (user.patternDetectionSettings.excursionSettings) setExcursionSettings(user.patternDetectionSettings.excursionSettings);
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
      excursionSettings,
    });
  };

  const handleResetPatternDefaults = () => {
    setDefaultHtf(DEFAULT_PATTERN_DETECTION_SETTINGS.defaultHtf);
    setDefaultLtf(DEFAULT_PATTERN_DETECTION_SETTINGS.defaultLtf);
    setAutoDetectOnImport(true);
    setAutoDetectMistakes(true);
    setInstrumentOverrides(DEFAULT_PATTERN_DETECTION_SETTINGS.instrumentOverrides);
    setExcursionSettings(DEFAULT_EXCURSION_SETTINGS);
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

  // =========================================================================
  // 3.5. IN-CAR & APPLE CARPLAY SIRI VOICE STATE
  // =========================================================================
  const { data: carPlaySetupData, isLoading: isLoadingCarPlay } = useQuery({
    queryKey: ['carplay-setup'],
    queryFn: () => api.carplay.getSetup(),
    enabled: activeTab === 2,
  });

  const carPlaySetup = (carPlaySetupData as any)?.data ?? carPlaySetupData;
  const [copiedVoiceKey, setCopiedVoiceKey] = useState<string | null>(null);
  const [speakingEndpoint, setSpeakingEndpoint] = useState<string | null>(null);

  const regenerateCarPlayTokenMutation = useMutation({
    mutationFn: () => api.carplay.regenerateToken(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carplay-setup'] });
      toast.success('CarPlay voice token regenerated successfully!');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to regenerate CarPlay token');
    },
  });

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    if (!text) return false;
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('navigator.clipboard.writeText failed, using fallback:', err);
      }
    }

    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, 99999);
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) return true;
    } catch (fallbackErr) {
      console.error('Fallback execCommand copy failed:', fallbackErr);
    }

    try {
      window.prompt('Copy this URL:', text);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyVoiceUrl = async (key: string, url: string) => {
    if (!url) {
      toast.error('URL is not available yet.');
      return;
    }
    const success = await copyTextToClipboard(url);
    if (success) {
      setCopiedVoiceKey(key);
      toast.success('Siri URL copied to clipboard!');
      setTimeout(() => setCopiedVoiceKey(null), 2500);
    } else {
      toast.error('Could not copy automatically. Please copy the link manually.');
    }
  };

  const handleTestCarPlaySpeech = async (key: string, url: string) => {
    try {
      setSpeakingEndpoint(key);
      const res = await fetch(url);
      const text = await res.text();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.onend = () => setSpeakingEndpoint(null);
        utterance.onerror = () => setSpeakingEndpoint(null);
        window.speechSynthesis.speak(utterance);
        toast.info(text);
      } else {
        toast.info(text);
        setSpeakingEndpoint(null);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to fetch CarPlay voice briefing');
      setSpeakingEndpoint(null);
    }
  };

  // =========================================================================
  // 4. BROKER INTEGRATIONS (FYERS & ANGEL ONE) STATE
  // =========================================================================
  const [fyersAppId, setFyersAppId] = useState('');
  const [fyersSecretKey, setFyersSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [fyersAutoSync, setFyersAutoSync] = useState(true);
  const [fyersSuccess, setFyersSuccess] = useState(false);
  const [fyersError, setFyersError] = useState<string | null>(null);

  const { data: fyersStatus } = useQuery({
    queryKey: ['fyers-status'],
    queryFn: () => api.integrations.fyersStatus(),
    enabled: hasFyersAccount,
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
    if (typeof fyersData?.autoSyncEnabled === 'boolean') {
      setFyersAutoSync(fyersData.autoSyncEnabled);
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
    mutationFn: (payload: { appId: string; secretKey?: string; autoSyncEnabled?: boolean }) =>
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
    enabled: hasMarketDataAccount,
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
  const [baseCurrency, setBaseCurrency] = useState(user?.baseCurrency || 'USD');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [aiModel, setAiModel] = useState((user as any)?.aiSettings?.model || 'gemini-2.5-flash');
  const [aiEnabled, setAiEnabled] = useState((user as any)?.aiSettings?.enabled ?? true);
  const [autoAnalyzeTrades, setAutoAnalyzeTrades] = useState((user as any)?.aiSettings?.autoAnalyzeTrades ?? true);
  const [autoApplyTradeDetails, setAutoApplyTradeDetails] = useState((user as any)?.aiSettings?.autoApplyTradeDetails ?? false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [geminiTestResult, setGeminiTestResult] = useState<{
    success: boolean;
    model?: string;
    latencyMs?: number;
    message?: string;
    error?: string;
  } | null>(null);

  const testGeminiMutation = useMutation({
    mutationFn: (apiKeyToTest?: string) => api.settings.testGemini({ apiKey: apiKeyToTest, model: aiModel }),
    onSuccess: (res: any) => {
      const data = res?.data || res;
      setGeminiTestResult({
        success: true,
        model: data?.model || aiModel,
        latencyMs: data?.latencyMs,
        message: data?.message || 'Google Gemini API is connected and operational.',
      });
      toast.success(`Google Gemini API verified (${data?.model || aiModel}, ${data?.latencyMs || 0}ms)!`);
      refreshUser();
    },
    onError: (err: any) => {
      const msg = err.message || 'Gemini connection test failed';
      setGeminiTestResult({
        success: false,
        error: msg,
      });
      toast.error(`Gemini Error: ${msg}`);
    },
  });

  useEffect(() => {
    if ((user as any)?.aiSettings) {
      setAiEnabled((user as any).aiSettings.enabled ?? true);
      setAutoAnalyzeTrades((user as any).aiSettings.autoAnalyzeTrades ?? true);
      setAutoApplyTradeDetails((user as any).aiSettings.autoApplyTradeDetails ?? false);
      if ((user as any).aiSettings.geminiApiKey) {
        setGeminiApiKey((user as any).aiSettings.geminiApiKey);
      }
      if ((user as any).aiSettings.model) {
        setAiModel((user as any).aiSettings.model);
      }
    }
  }, [user]);

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
    onSuccess: (_, variables) => {
      refreshUser();
      setProfileError(null);
      setProfileSuccess(true);
      toast.success('Profile preferences saved successfully.');
      setTimeout(() => setProfileSuccess(false), 3000);

      // If user saved a Gemini API key or has an active key and didn't clear it, test connection automatically
      if (variables?.aiSettings?.geminiApiKey || (!variables?.aiSettings?.clearGeminiApiKey && ((user as any)?.aiSettings?.hasGeminiApiKey || (user as any)?.aiSettings?.geminiApiKey))) {
        testGeminiMutation.mutate(variables?.aiSettings?.geminiApiKey);
      }
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
    profileMutation.mutate({
      name,
      baseCurrency,
      defaultAccountScope: selectedScopeValue,
      aiSettings: {
        geminiApiKey: geminiApiKey && !geminiApiKey.startsWith('••') ? geminiApiKey : undefined,
        enabled: aiEnabled,
        autoAnalyzeTrades,
        autoApplyTradeDetails,
        model: aiModel,
      },
    });
  };

  const handleClearGeminiKey = () => {
    profileMutation.mutate({
      name,
      baseCurrency,
      defaultAccountScope: selectedScopeValue,
      aiSettings: {
        clearGeminiApiKey: true,
        enabled: aiEnabled,
        autoAnalyzeTrades,
        autoApplyTradeDetails,
        model: aiModel,
      },
    });
    setGeminiApiKey('');
    setGeminiTestResult(null);
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
            Settings &amp; Trading Cockpit
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure automated order execution, scaling ladders, risk guardrails, Telegram alerts, and broker connections
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
          <Chip
            icon={<SendRounded sx={{ fontSize: '0.9rem !important' }} />}
            label={telegramAlertsEnabled && (telegramBotToken || user?.liveWatcherSettings?.telegramBotToken) ? 'TELEGRAM ACTIVE' : 'TELEGRAM MUTED'}
            color={telegramAlertsEnabled && (telegramBotToken || user?.liveWatcherSettings?.telegramBotToken) ? 'info' : 'default'}
            variant="outlined"
            size="small"
            sx={{ fontWeight: 700, fontSize: '0.6875rem' }}
          />
        </Box>
      </Box>

      {/* Persistent Global Workspace & Account Mode Selector */}
      <Card
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2.5,
          borderColor: selectedScopeValue.startsWith('PROP_FIRM') ? 'secondary.main' : 'primary.main',
          background: isDark
            ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)'
            : 'linear-gradient(90deg, rgba(16, 185, 129, 0.04) 0%, rgba(99, 102, 241, 0.04) 100%)',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShieldRounded sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Default Trading Mode &amp; Account Scope
              </Typography>
              <Chip
                label="Saved to Backend"
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Choose which account mode loads by default across all pages, charts, live watcher, and analytics.
            </Typography>
          </Box>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={
              selectedScopeValue.startsWith('PROP_FIRM')
                ? 'PROP_FIRM:ALL'
                : selectedScopeValue.startsWith('TYPE:LIVE')
                ? 'TYPE:LIVE'
                : 'ALL'
            }
            onChange={(_, val) => {
              if (!val) return;
              setScopeValue(val);
              const modeLabel =
                val === 'PROP_FIRM:ALL'
                  ? 'Prop Firm Mode'
                  : val === 'TYPE:LIVE'
                  ? 'Normal / Personal Account Mode'
                  : 'All Accounts (Consolidated)';
              toast.success(`Default mode saved: ${modeLabel}`);
            }}
            sx={{ flexWrap: 'wrap' }}
          >
            <ToggleButton value="ALL" sx={{ px: 2, py: 0.75, fontWeight: 700, textTransform: 'none' }}>
              🌐 All Accounts
            </ToggleButton>
            <ToggleButton value="TYPE:LIVE" sx={{ px: 2, py: 0.75, fontWeight: 700, textTransform: 'none' }}>
              💼 Normal Account{personalAccounts.length === 1 ? ` (${personalAccounts[0].name})` : ''}
            </ToggleButton>
            <ToggleButton value="PROP_FIRM:ALL" sx={{ px: 2, py: 0.75, fontWeight: 700, textTransform: 'none' }}>
              🏆 Prop Firm Mode{propAccounts.length === 1 ? ` (${propAccounts[0].name})` : ''}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Card>

      {/* Modern Navigation Tabs Header (6 Organized Categories) */}
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
        <Tab icon={<FlashOnRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Execution & Scaling" />
        <Tab icon={<ShieldRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Risk & Guardrails" />
        <Tab icon={<SendRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Telegram & Mobile" />
        <Tab icon={<TimelineRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Market Structure" />
        <Tab icon={<KeyRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Broker Connections" />
        <Tab icon={<PersonRounded sx={{ fontSize: 18 }} />} iconPosition="start" label="Profile & System" />
      </Tabs>

      {/* TAB 0: EXECUTION & SCALING */}
      {activeTab === 0 && (
        <ExecutionSettingsTab
          settingsCurrency={settingsCurrency}
          defaultAutoExecute={defaultAutoExecute}
          setDefaultAutoExecute={setDefaultAutoExecute}
          defaultTargetMode={defaultTargetMode}
          onApplyPresetMode={handleApplyPresetMode}
          targetDistributionMode={targetDistributionMode}
          setTargetDistributionMode={setTargetDistributionMode}
          executionAlgorithm={executionAlgorithm}
          setExecutionAlgorithm={setExecutionAlgorithm}
          maxSlippagePercent={maxSlippagePercent}
          setMaxSlippagePercent={setMaxSlippagePercent}
          maxSlippagePoints={maxSlippagePoints}
          setMaxSlippagePoints={setMaxSlippagePoints}
          spreadSurgeProtectionEnabled={spreadSurgeProtectionEnabled}
          setSpreadSurgeProtectionEnabled={setSpreadSurgeProtectionEnabled}
          spreadSurgeMultiplier={spreadSurgeMultiplier}
          setSpreadSurgeMultiplier={setSpreadSurgeMultiplier}
          antiLoopProtectionEnabled={antiLoopProtectionEnabled}
          setAntiLoopProtectionEnabled={setAntiLoopProtectionEnabled}
          orderRateLimitPer5Sec={orderRateLimitPer5Sec}
          setOrderRateLimitPer5Sec={setOrderRateLimitPer5Sec}
          beCushionTicks={beCushionTicks}
          setBeCushionTicks={setBeCushionTicks}
          assetProfile={assetProfile}
          setAssetProfile={setAssetProfile}
          onApplyAssetProfile={handleApplyAssetProfile}
          openingBellFreezeEnabled={openingBellFreezeEnabled}
          setOpeningBellFreezeEnabled={setOpeningBellFreezeEnabled}
          openingBellFreezeMinutes={openingBellFreezeMinutes}
          setOpeningBellFreezeMinutes={setOpeningBellFreezeMinutes}
          macroNewsLockoutEnabled={macroNewsLockoutEnabled}
          setMacroNewsLockoutEnabled={setMacroNewsLockoutEnabled}
          scaleInEnabled={scaleInEnabled}
          setScaleInEnabled={setScaleInEnabled}
          scaleInTriggerR={scaleInTriggerR}
          setScaleInTriggerR={setScaleInTriggerR}
          scaleInSizePercent={scaleInSizePercent}
          setScaleInSizePercent={setScaleInSizePercent}
          scaleInCondition={scaleInCondition}
          setScaleInCondition={setScaleInCondition}
          telegramNotifyOnAutoExecution={telegramNotifyOnAutoExecution}
          setTelegramNotifyOnAutoExecution={setTelegramNotifyOnAutoExecution}
          onAutoTuneFromAnalytics={handleAutoTuneFromAnalytics}
          isAutoTuning={isAutoTuning}
          t1MultipleR={t1MultipleR}
          setT1MultipleR={setT1MultipleR}
          t1ExitPercent={t1ExitPercent}
          setT1ExitPercent={setT1ExitPercent}
          t1TrailingAction={t1TrailingAction}
          setT1TrailingAction={setT1TrailingAction}
          t1TrailPoints={t1TrailPoints}
          setT1TrailPoints={setT1TrailPoints}
          t2Enabled={t2Enabled}
          setT2Enabled={setT2Enabled}
          t2MultipleR={t2MultipleR}
          setT2MultipleR={setT2MultipleR}
          t2ExitPercent={t2ExitPercent}
          setT2ExitPercent={setT2ExitPercent}
          t2TrailingAction={t2TrailingAction}
          setT2TrailingAction={setT2TrailingAction}
          t2TrailPoints={t2TrailPoints}
          setT2TrailPoints={setT2TrailPoints}
          isFreeRunner={isFreeRunner}
          setIsFreeRunner={setIsFreeRunner}
          t3MultipleR={t3MultipleR}
          setT3MultipleR={setT3MultipleR}
          dynamicTrailingEnabled={dynamicTrailingEnabled}
          setDynamicTrailingEnabled={setDynamicTrailingEnabled}
          dynamicTriggerR={dynamicTriggerR}
          setDynamicTriggerR={setDynamicTriggerR}
          dynamicTrailType={dynamicTrailType}
          setDynamicTrailType={setDynamicTrailType}
          dynamicStepR={dynamicStepR}
          setDynamicStepR={setDynamicStepR}
          dynamicTrailPoints={dynamicTrailPoints}
          setDynamicTrailPoints={setDynamicTrailPoints}
          givebackAutoExitEnabled={givebackAutoExitEnabled}
          setGivebackAutoExitEnabled={setGivebackAutoExitEnabled}
          givebackMinPeakR={givebackMinPeakR}
          setGivebackMinPeakR={setGivebackMinPeakR}
          givebackMaxPercent={givebackMaxPercent}
          setGivebackMaxPercent={setGivebackMaxPercent}
          misSquareOffEnabled={misSquareOffEnabled}
          setMisSquareOffEnabled={setMisSquareOffEnabled}
          misSquareOffTime={misSquareOffTime}
          setMisSquareOffTime={setMisSquareOffTime}
          scalperHotkeysEnabled={scalperHotkeysEnabled}
          setScalperHotkeysEnabled={setScalperHotkeysEnabled}
          soundAlertsEnabled={soundAlertsEnabled}
          setSoundAlertsEnabled={setSoundAlertsEnabled}
          defaultRefreshIntervalSec={defaultRefreshIntervalSec}
          setDefaultRefreshIntervalSec={setDefaultRefreshIntervalSec}
          paperExecutionMode={paperExecutionMode}
          setPaperExecutionMode={setPaperExecutionMode}
          serverSideExecutionEnabled={serverSideExecutionEnabled}
          setServerSideExecutionEnabled={setServerSideExecutionEnabled}
          isSaving={liveWatcherMutation.isPending}
          saveSuccess={watcherSuccess}
          saveError={watcherError}
          onSave={handleWatcherSubmit}
          onResetDefaults={handleResetWatcherDefaults}
        />
      )}

      {/* TAB 1: RISK & GUARDRAILS */}
      {activeTab === 1 && (
        <RiskGuardrailsTab
          currSym={currSym}
          maxDailyLoss={maxDailyLoss}
          setMaxDailyLoss={setMaxDailyLoss}
          maxDailyTrades={maxDailyTrades}
          setMaxDailyTrades={setMaxDailyTrades}
          maxOpenTrades={maxOpenTrades}
          setMaxOpenTrades={setMaxOpenTrades}
          maxRiskPerTradePercent={maxRiskPerTradePercent}
          setMaxRiskPerTradePercent={setMaxRiskPerTradePercent}
          revengeTradingMinutes={revengeTradingMinutes}
          setRevengeTradingMinutes={setRevengeTradingMinutes}
          hardDisciplineLockoutEnabled={hardDisciplineLockoutEnabled}
          setHardDisciplineLockoutEnabled={setHardDisciplineLockoutEnabled}
          hardDisciplineLockoutDurationMins={hardDisciplineLockoutDurationMins}
          setHardDisciplineLockoutDurationMins={setHardDisciplineLockoutDurationMins}
          enforceTelegramOrderGuardrails={enforceTelegramOrderGuardrails}
          setEnforceTelegramOrderGuardrails={setEnforceTelegramOrderGuardrails}
          enforceAdaptiveDayRiskGuardrails={enforceAdaptiveDayRiskGuardrails}
          setEnforceAdaptiveDayRiskGuardrails={setEnforceAdaptiveDayRiskGuardrails}
          isSaving={riskMutation.isPending || liveWatcherMutation.isPending}
          saveSuccess={riskSuccess}
          saveError={riskError}
          onSave={handleRiskSubmit}
        />
      )}

      {/* TAB 2: TELEGRAM & MOBILE */}
      {activeTab === 2 && (
        <TelegramMobileTab
          telegramAlertsEnabled={telegramAlertsEnabled}
          setTelegramAlertsEnabled={setTelegramAlertsEnabled}
          telegramBotToken={telegramBotToken}
          setTelegramBotToken={setTelegramBotToken}
          telegramChatId={telegramChatId}
          setTelegramChatId={setTelegramChatId}
          userBotToken={user?.liveWatcherSettings?.telegramBotToken}
          userChatId={user?.liveWatcherSettings?.telegramChatId}
          testingTelegram={testingTelegram}
          onTestTelegram={handleTestTelegram}
          sendingSampleAlert={sendingSampleAlert}
          onSendSampleAlert={handleSendSampleAlert}
          hasLiveExecutableAccount={hasLiveExecutableAccount}
          registeringWebhook={registeringWebhook}
          onRegisterWebhook={handleRegisterWebhook}
          onClearTelegramCredentials={handleClearTelegramCredentials}
          restrictTelegramTradeExecution={restrictTelegramTradeExecution}
          setRestrictTelegramTradeExecution={setRestrictTelegramTradeExecution}
          goldDefaultLot={goldDefaultLot}
          setGoldDefaultLot={setGoldDefaultLot}
          goldSlPoints={goldSlPoints}
          setGoldSlPoints={setGoldSlPoints}
          goldRrRatio={goldRrRatio}
          setGoldRrRatio={setGoldRrRatio}
          ethDefaultLot={ethDefaultLot}
          setEthDefaultLot={setEthDefaultLot}
          ethSlPrice={ethSlPrice}
          setEthSlPrice={setEthSlPrice}
          ethRrRatio={ethRrRatio}
          setEthRrRatio={setEthRrRatio}
          telegramAttachLiveChart={telegramAttachLiveChart}
          setTelegramAttachLiveChart={setTelegramAttachLiveChart}
          telegramChartTimeframe={telegramChartTimeframe}
          setTelegramChartTimeframe={setTelegramChartTimeframe}
          telegramAlertEvents={telegramAlertEvents}
          setTelegramAlertEvents={setTelegramAlertEvents}
          goldNewsLeadTimesMinutes={goldNewsLeadTimesMinutes}
          setGoldNewsLeadTimesMinutes={setGoldNewsLeadTimesMinutes}
          goldNewsReminderMinutes={goldNewsReminderMinutes}
          setGoldNewsReminderMinutes={setGoldNewsReminderMinutes}
          goldNewsImpactFilter={goldNewsImpactFilter}
          setGoldNewsImpactFilter={setGoldNewsImpactFilter}
          customLeadInput={customLeadInput}
          setCustomLeadInput={setCustomLeadInput}
          testingGoldNewsAlert={testingGoldNewsAlert}
          onTestGoldNewsAlert={handleTestGoldNewsAlert}
          testingGoldNewsResultAlert={testingGoldNewsResultAlert}
          onTestGoldNewsResultAlert={handleTestGoldNewsResultAlert}
          testingSessionAlert={testingSessionAlert}
          onTestSessionAlert={handleTestSessionAlert}
          isLoadingCarPlay={isLoadingCarPlay}
          carPlaySetup={carPlaySetup}
          copiedVoiceKey={copiedVoiceKey}
          speakingEndpoint={speakingEndpoint}
          onCopyVoiceUrl={handleCopyVoiceUrl}
          onTestCarPlaySpeech={handleTestCarPlaySpeech}
          onRegenerateCarPlayToken={() => regenerateCarPlayTokenMutation.mutate()}
          isRegeneratingToken={regenerateCarPlayTokenMutation.isPending}
          isSaving={liveWatcherMutation.isPending}
          saveSuccess={watcherSuccess}
          saveError={watcherError}
          onSave={handleWatcherSubmit}
        />
      )}

      {/* TAB 3: MARKET STRUCTURE */}
      {activeTab === 3 && (
        <MarketStructureTab
          defaultHtf={defaultHtf}
          setDefaultHtf={setDefaultHtf}
          defaultLtf={defaultLtf}
          setDefaultLtf={setDefaultLtf}
          autoDetectOnImport={autoDetectOnImport}
          setAutoDetectOnImport={setAutoDetectOnImport}
          autoDetectMistakes={autoDetectMistakes}
          setAutoDetectMistakes={setAutoDetectMistakes}
          instrumentOverrides={instrumentOverrides}
          excursionSettings={excursionSettings}
          setExcursionSettings={setExcursionSettings}
          onOpenAddOverride={handleOpenAddOverride}
          onEditOverride={handleEditOverride}
          onDeleteOverride={handleDeleteOverride}
          onAddPreset={handleAddPreset}
          onResetDefaults={handleResetPatternDefaults}
          isSaving={patternMutation.isPending}
          saveSuccess={patternSuccess}
          saveError={patternError}
          onSave={handlePatternSubmit}
        />
      )}

      {/* TAB 4: BROKER CONNECTIONS */}
      {activeTab === 4 && (
        <BrokerConnectionsTab
          hasFyersAccount={hasFyersAccount}
          hasMarketDataAccount={hasMarketDataAccount}
          hasMt5Account={hasMt5Account}
          isFyersConnected={isFyersConnected}
          isFyersConfigured={isFyersConfigured}
          fyersData={fyersData}
          fyersRedirectUri={fyersRedirectUri}
          fyersAppId={fyersAppId}
          setFyersAppId={setFyersAppId}
          fyersSecretKey={fyersSecretKey}
          setFyersSecretKey={setFyersSecretKey}
          showSecretKey={showSecretKey}
          setShowSecretKey={setShowSecretKey}
          fyersAutoSync={fyersAutoSync}
          setFyersAutoSync={setFyersAutoSync}
          showFyersDevDetails={showFyersDevDetails}
          setShowFyersDevDetails={setShowFyersDevDetails}
          onSaveFyersConfig={() => fyersConfigMutation.mutate({ appId: fyersAppId, secretKey: fyersSecretKey, autoSyncEnabled: fyersAutoSync })}
          onConnectFyers={() => fyersConnectMutation.mutate()}
          onSyncFyers={() => {
            if (!isFyersConnected) {
              toast.info('FYERS session not authorized for today. Launching 1-Click Daily Auth...');
              fyersConnectMutation.mutate();
            } else {
              fyersSyncMutation.mutate();
            }
          }}
          onDisconnectFyers={() => fyersDisconnectMutation.mutate()}
          isSavingFyers={fyersConfigMutation.isPending}
          isConnectingFyers={fyersConnectMutation.isPending}
          isSyncingFyers={fyersSyncMutation.isPending}
          isDisconnectingFyers={fyersDisconnectMutation.isPending}
          fyersSuccess={fyersSuccess}
          fyersError={fyersError}
          onCopyText={copyTextToClipboard}
          isAngelOneLoading={isAngelOneLoading}
          isAngelOneConnected={isAngelOneConnected}
          isAngelOneConfigured={isAngelOneConfigured}
          isAngelOneTokenExpired={isAngelOneTokenExpired}
          angelOneData={angelOneData}
          angelOneApiKey={angelOneApiKey}
          setAngelOneApiKey={setAngelOneApiKey}
          angelOneClientCode={angelOneClientCode}
          setAngelOneClientCode={setAngelOneClientCode}
          angelOnePin={angelOnePin}
          setAngelOnePin={setAngelOnePin}
          showAngelOneKey={showAngelOneKey}
          setShowAngelOneKey={setShowAngelOneKey}
          showAngelOnePin={showAngelOnePin}
          setShowAngelOnePin={setShowAngelOnePin}
          onOpenTotpDialog={() => setIsTotpDialogOpen(true)}
          onSaveAngelOneConfig={() =>
            angelOneConfigMutation.mutate({
              apiKey: angelOneApiKey,
              clientCode: angelOneClientCode,
              pin: angelOnePin,
            })
          }
          onRefreshAngelOne={() => angelOneRefreshMutation.mutate(true)}
          onDisconnectAngelOne={() => angelOneDisconnectMutation.mutate()}
          isSavingAngelOne={angelOneConfigMutation.isPending}
          isConnectingAngelOne={angelOneConnectMutation.isPending}
          isRefreshingAngelOne={angelOneRefreshMutation.isPending}
          isDisconnectingAngelOne={angelOneDisconnectMutation.isPending}
          goldDefaultLot={goldDefaultLot}
          goldSlPoints={goldSlPoints}
          goldRrRatio={goldRrRatio}
          ethDefaultLot={ethDefaultLot}
          ethSlPrice={ethSlPrice}
          ethRrRatio={ethRrRatio}
          defaultDollarRisk={defaultDollarRisk}
          onNavigateToTelegramTab={() => setActiveTab(2)}
        />
      )}

      {/* TAB 5: PROFILE & SYSTEM */}
      {activeTab === 5 && (
        <ProfileSystemTab
          name={name}
          setName={setName}
          email={user?.email || ''}
          selectedScopeValue={selectedScopeValue}
          setScopeValue={setScopeValue}
          personalAccounts={personalAccounts}
          propAccounts={propAccounts}
          baseCurrency={baseCurrency}
          setBaseCurrency={setBaseCurrency}
          theme={theme}
          setTheme={setTheme}
          showHelpHints={showHelpHints}
          setShowHelpHints={setShowHelpHints}
          displaySettings={displaySettings}
          setDisplaySettings={setDisplaySettings}
          onSaveDisplaySettings={() => {
            liveWatcherMutation.mutate({
              ...user?.liveWatcherSettings,
              displaySettings,
            } as any);
          }}
          currentPassword={currentPassword}
          setCurrentPassword={setCurrentPassword}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          passwordMsg={passwordMsg}
          onProfileSubmit={handleProfileSubmit}
          onPasswordSubmit={handlePasswordSubmit}
          isSavingProfile={profileMutation.isPending}
          profileSuccess={profileSuccess}
          profileError={profileError}
          isChangingPassword={passwordMutation.isPending}
          activeSessions={activeSessions}
          isLoadingSessions={isLoadingSessions}
          onRevokeSession={(id) => revokeSessionMutation.mutate(id)}
          isRevokingSession={revokeSessionMutation.isPending}
          onLogoutAll={() => logoutAllMutation.mutate()}
          isLoggingOutAll={logoutAllMutation.isPending}
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          systemStatus={systemStatus}
          geminiApiKey={geminiApiKey}
          setGeminiApiKey={setGeminiApiKey}
          aiModel={aiModel}
          setAiModel={setAiModel}
          aiEnabled={aiEnabled}
          setAiEnabled={setAiEnabled}
          autoAnalyzeTrades={autoAnalyzeTrades}
          setAutoAnalyzeTrades={setAutoAnalyzeTrades}
          autoApplyTradeDetails={autoApplyTradeDetails}
          setAutoApplyTradeDetails={setAutoApplyTradeDetails}
          hasGeminiKey={Boolean((user as any)?.aiSettings?.hasGeminiApiKey || (user as any)?.aiSettings?.geminiApiKey)}
          onClearGeminiKey={handleClearGeminiKey}
          onTestGemini={(keyToTest) => testGeminiMutation.mutate(keyToTest)}
          isTestingGemini={testGeminiMutation.isPending}
          geminiTestResult={geminiTestResult}
        />
      )}

      {/* Angel One TOTP Dialog */}
      <AngelOneTotpDialog
        open={isTotpDialogOpen}
        onClose={() => {
          setIsTotpDialogOpen(false);
          setAngelOneTotp('');
        }}
        clientCode={angelOneClientCode}
        totp={angelOneTotp}
        onTotpChange={setAngelOneTotp}
        onSubmit={() => angelOneConnectMutation.mutate(angelOneTotp)}
        isPending={angelOneConnectMutation.isPending}
      />

      {/* Instrument Override Dialog */}
      <InstrumentOverrideDialog
        open={overrideDialogOpen}
        onClose={() => setOverrideDialogOpen(false)}
        isEditing={editingOverrideIndex !== null}
        symbol={overrideSymbol}
        onSymbolChange={setOverrideSymbol}
        htf={overrideHtf}
        onHtfChange={setOverrideHtf}
        ltf={overrideLtf}
        onLtfChange={setOverrideLtf}
        preferredStrategyId={overridePreferredStrategyId}
        onPreferredStrategyIdChange={setOverridePreferredStrategyId}
        userStrategies={userStrategies}
        onSave={handleSaveOverride}
      />
    </Box>
  );
}
