import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Switch from '@mui/material/Switch';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Skeleton from '@mui/material/Skeleton';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Badge from '@mui/material/Badge';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import PieChartRoundedIcon from '@mui/icons-material/PieChartRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ViewHeadlineRoundedIcon from '@mui/icons-material/ViewHeadlineRounded';
import ViewDayRoundedIcon from '@mui/icons-material/ViewDayRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded';
import LinearScaleRoundedIcon from '@mui/icons-material/LinearScaleRounded';

import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import NotificationsOffRoundedIcon from '@mui/icons-material/NotificationsOffRounded';
import DangerousRoundedIcon from '@mui/icons-material/DangerousRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import KeyboardAltRoundedIcon from '@mui/icons-material/KeyboardAltRounded';
import PictureInPictureRoundedIcon from '@mui/icons-material/PictureInPictureRounded';
import BookmarkBorderRoundedIcon from '@mui/icons-material/BookmarkBorderRounded';
import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';

import { LiveMarketChart } from '../../dashboard/PropLiveMarketChart.js';
import { LiveGivebackMeter } from './LiveGivebackMeter.js';
import { LiveScalingLadder } from './LiveScalingLadder.js';
import { LiveUnifiedPriceLadder } from './LiveUnifiedPriceLadder.js';
import { ExecuteLadderStepDialog } from './ExecuteLadderStepDialog.js';
import { LiveCustomRulesDialog } from './LiveCustomRulesDialog.js';
import { LivePriceGauge } from './LivePriceGauge.js';
import { LiveSparkline } from './LiveSparkline.js';
import { LiveOptionsGreeksCard } from './LiveOptionsGreeksCard.js';
import { LivePortfolioRiskBanner } from './LivePortfolioRiskBanner.js';
import { PanicKillSwitchDialog } from './PanicKillSwitchDialog.js';
import { LiveAlertCenterDialog } from './LiveAlertCenterDialog.js';
import { HotkeyCheatSheetDialog } from './HotkeyCheatSheetDialog.js';
import { soundEngine } from '../../../lib/sound-engine.js';
import { notificationService } from '../../../lib/notification-service.js';
import { useAuth } from '../../../context/AuthContext.js';
import { useAccountScope } from '../../../context/AccountScopeContext.js';
import {
  ILiveWatcherSummary,
  ILiveOpenTradeMetric,
  ILiveTargetLadderStep,
  ICustomLadderRules,
  StopThreatLevel,
  ILiveDataHealth,
  CardDensityLevel,
  LiveWatcherSortMode,
  LadderViewMode,
  INextActionHint,
  IWatcherLayoutPreset,
  DEFAULT_WATCHER_LAYOUT_PRESETS,
  ILiveAlertState,
  createLadderRulesFromSettings,
} from '@tradevault/shared';
import {
  calculateTargetLadder,
  calculateDynamicTrailingStop,
  evaluateGivebackAutoExit,
  selectNextActionHint,
} from '@tradevault/financial-engine';
import { api } from '../../../lib/api.js';
import { formatCurrency } from '../../../lib/utils.js';
import { toast } from '../../../context/ToastContext.js';
import { QuickCloseTradeDialog } from '../QuickCloseTradeDialog.js';
import { TradeFlightRecorderDialog } from './TradeFlightRecorderDialog.js';

export interface LiveOpenTradeWatcherProps {
  accountId?: string;
  defaultExpanded?: boolean;
  showWhenEmpty?: boolean;
  onTradeCloseSuccess?: () => void;
}

function getIstInfo() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istNow = new Date(utc + (3600000 * 5.5));

  const hours = istNow.getHours();
  const minutes = istNow.getMinutes();
  const seconds = istNow.getSeconds();

  const targetSeconds = 15 * 3600 + 15 * 60; // 15:15:00 IST
  const currentSeconds = hours * 3600 + minutes * 60 + seconds;
  const diffSeconds = targetSeconds - currentSeconds;

  const isMarketOpen = (hours > 9 || (hours === 9 && minutes >= 15)) && (hours < 15 || (hours === 15 && minutes <= 30));
  const isPastMisCutoff = diffSeconds <= 0;

  let countdownStr = '';
  if (diffSeconds > 0) {
    const h = Math.floor(diffSeconds / 3600);
    const m = Math.floor((diffSeconds % 3600) / 60);
    const s = diffSeconds % 60;
    countdownStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const isMisCriticalWindow = isMarketOpen && diffSeconds > 0 && diffSeconds <= 900;
  const isMisActionTime = isMarketOpen && hours === 15 && minutes === 14;

  return {
    hours,
    minutes,
    seconds,
    diffSeconds,
    countdownStr,
    isMarketOpen,
    isPastMisCutoff,
    isMisCriticalWindow,
    isMisActionTime,
  };
}

export function LiveOpenTradeWatcher({
  accountId,
  defaultExpanded = true,
  showWhenEmpty = false,
  onTradeCloseSuccess,
}: LiveOpenTradeWatcherProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { scope, isPropMode, queryParams, selectedAccountId } = useAccountScope();

  const { data: propOverviewRes } = useQuery({
    queryKey: ['prop-overview', scope.mode, scope.firmKey, selectedAccountId, queryParams],
    queryFn: () => api.accounts.propOverview(queryParams),
    enabled: isPropMode,
    staleTime: 30 * 1000,
  });

  const propOverviewList = useMemo(() => {
    return Array.isArray(propOverviewRes)
      ? propOverviewRes
      : (propOverviewRes as any)?.data || [];
  }, [propOverviewRes]);

  const propDailyLossLimit = useMemo(() => {
    if (!isPropMode || propOverviewList.length === 0) return undefined;
    const firstProp = propOverviewList[0];
    return (
      firstProp.health?.dailyLossLimitAmount ??
      firstProp.dailyLossBuffer ??
      firstProp.health?.dailyBufferRemaining ??
      5000
    );
  }, [isPropMode, propOverviewList]);

  const propRemainingBuffer = useMemo(() => {
    if (!isPropMode || propOverviewList.length === 0) return undefined;
    const firstProp = propOverviewList[0];
    const dailyEval =
      firstProp.health?.rules?.dailyLoss ||
      firstProp.health?.rules?.DAILY_LOSS ||
      firstProp.evaluations?.find((e: any) => e.ruleKey === 'DAILY_LOSS' || e.ruleKey === 'dailyLoss');
    return dailyEval?.remaining ?? firstProp.dailyLossBuffer ?? firstProp.health?.dailyBufferRemaining;
  }, [isPropMode, propOverviewList]);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [viewMode, setViewMode] = useState<'cockpit' | 'table'>(() => {
    const saved = localStorage.getItem('tv_live_watcher_view_mode');
    return saved === 'table' ? 'table' : 'cockpit';
  });
  const [tacticalTabs, setTacticalTabs] = useState<Record<string, 'ladder' | 'giveback' | 'greeks' | 'pulse'>>({});
  const [controlsAnchorEl, setControlsAnchorEl] = useState<null | HTMLElement>(null);
  const isControlsOpen = Boolean(controlsAnchorEl);
  const [isDeRiskingAll, setIsDeRiskingAll] = useState<boolean>(false);
  const [recapTrade, setRecapTrade] = useState<any | null>(null);

  const [cardDensity, setCardDensity] = useState<CardDensityLevel>(() => {
    const saved = localStorage.getItem('tv_live_watcher_card_density');
    return (saved === 'glance' || saved === 'deep' ? saved : user?.liveWatcherSettings?.cardDensity ?? 'standard') as CardDensityLevel;
  });

  const [sortMode, setSortMode] = useState<LiveWatcherSortMode>(() => {
    const saved = localStorage.getItem('tv_live_watcher_sort_mode');
    return (saved === 'entryTime' ? 'entryTime' : user?.liveWatcherSettings?.sortMode ?? 'urgency') as LiveWatcherSortMode;
  });

  const [ladderViewMode, setLadderViewMode] = useState<LadderViewMode>(() => {
    const saved = localStorage.getItem('tv_live_watcher_ladder_view');
    return (saved === 'vertical' ? 'vertical' : user?.liveWatcherSettings?.ladderViewMode ?? 'classic') as LadderViewMode;
  });

  // Per-card manual collapse state and 60-second immunity tracker
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const manualCollapseTimestamps = useRef<Record<string, number>>({});

  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(() => {
    const saved = localStorage.getItem('tv_live_watcher_interval');
    return saved !== null ? Number(saved) : (user?.liveWatcherSettings?.defaultRefreshIntervalSec ?? 5);
  });

  // Sound & notification state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (user?.liveWatcherSettings?.soundAlertsEnabled !== undefined) {
      return user.liveWatcherSettings.soundAlertsEnabled;
    }
    return soundEngine.isEnabled();
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => notificationService.getPermission() === 'granted');
  const [killSwitchOpen, setKillSwitchOpen] = useState<boolean>(false);
  const [maxDailyLoss] = useState<number>(() => {
    const saved = localStorage.getItem('tv_max_daily_loss');
    return saved ? Number(saved) : 5000;
  });

  // IST Clock & MIS countdown ticker
  const [istInfo, setIstInfo] = useState(() => getIstInfo());
  const lastThreatAudioTimeRef = useRef<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIstInfo(getIstInfo());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 3.1 Tab Title & Favicon throttling
  const originalTitleRef = useRef<string>(typeof document !== 'undefined' ? document.title : 'SetupMint — Quantitative Trading Journal');
  const originalFaviconRef = useRef<string>('');
  const lastTitleUpdateRef = useRef<number>(0);

  // 3.2 In-App Threat Alert Center State & Query
  const [alertCenterOpen, setAlertCenterOpen] = useState<boolean>(false);
  const { data: liveAlerts = [] } = useQuery<ILiveAlertState[]>({
    queryKey: ['live-alerts-summary', queryParams],
    queryFn: () => api.trades.getLiveAlerts(queryParams),
    refetchInterval: 10000,
  });
  const activeAlertsCount = liveAlerts.filter((a) => a.state === 'ACTIVE').length;
  const urgentAlertsCount = liveAlerts.filter((a) => a.state === 'ACTIVE' && a.severity >= 2).length;

  // 3.3 Watcher Layout Presets State
  const layoutPresets: IWatcherLayoutPreset[] = useMemo(() => {
    return user?.liveWatcherSettings?.layoutPresets && user.liveWatcherSettings.layoutPresets.length > 0
      ? user.liveWatcherSettings.layoutPresets
      : DEFAULT_WATCHER_LAYOUT_PRESETS;
  }, [user?.liveWatcherSettings?.layoutPresets]);

  const [activePresetId, setActivePresetId] = useState<string>(() => {
    return user?.liveWatcherSettings?.activePresetId || 'positional';
  });
  const [presetMenuAnchor, setPresetMenuAnchor] = useState<null | HTMLElement>(null);
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');

  // 3.4 Hotkeys Cheat Sheet State
  const [cheatSheetOpen, setCheatSheetOpen] = useState<boolean>(false);

  // 3.5 Pop-Out Mini Watcher (Picture-in-Picture) State
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [isPipActive, setIsPipActive] = useState<boolean>(false);

  // 3.6 Screen Reader Announcements State
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState<string>('');
  const [politeAnnouncement, setPoliteAnnouncement] = useState<string>('');
  const lastThreatAnnouncedRef = useRef<Record<string, StopThreatLevel>>({});

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEngine.setEnabled(next);
    if (next) soundEngine.playAutoExecuted();
    toast.info(next ? '🔊 Audio alerts enabled' : '🔇 Audio alerts muted');
  };

  const handleToggleNotifications = async () => {
    if (!notificationService.isSupported()) {
      toast.warning('Desktop notifications are not supported by this browser.');
      return;
    }
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      toast.info('Desktop notifications disabled.');
    } else {
      const granted = await notificationService.requestPermission();
      setNotificationsEnabled(granted);
      if (granted) {
        notificationService.sendNotification('SetupMint Notifications Active', {
          body: 'You will receive instant alerts for target executions and risk triggers.',
        });
        toast.success('🔔 Desktop notifications active!');
      } else {
        toast.warning('Notification permission was denied in browser settings.');
      }
    }
  };

  // Quick close modal state
  const [quickCloseTrade, setQuickCloseTrade] = useState<any | null>(null);
  const [quickCloseLtp, setQuickCloseLtp] = useState<number | undefined>(undefined);
  const [quickCloseRatio, setQuickCloseRatio] = useState<number>(1.0);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Stop Loss adjust modal state
  const [editSlMetric, setEditSlMetric] = useState<ILiveOpenTradeMetric | null>(null);
  const [targetSlPrice, setTargetSlPrice] = useState<string>('');
  const [executeSlOnBroker, setExecuteSlOnBroker] = useState<boolean>(true);

  const updateSlMutation = useMutation({
    mutationFn: async ({
      tradeId,
      newStopLoss,
      executeBroker = true,
      idempotencyKey,
    }: {
      tradeId: string;
      newStopLoss: number;
      executeBroker?: boolean;
      idempotencyKey?: string;
    }) => {
      return api.trades.liveBrokerSl(tradeId, {
        stopPrice: newStopLoss,
        executeBroker,
        idempotencyKey: idempotencyKey || `${tradeId}_sl_${newStopLoss}_${Date.now()}`,
      });
    },
    onSuccess: (data: any, variables) => {
      if (data?.brokerResult?.executedOnBroker) {
        toast.success(`🟢 FYERS Live: ${data.brokerResult.message || `Stop Loss moved to ₹${variables.newStopLoss}`}`);
      } else {
        toast.success(`Stop Loss moved to ₹${variables.newStopLoss} successfully!`);
      }
      queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setEditSlMetric(null);
      setTargetSlPrice('');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update Stop Loss');
    },
  });

  const handleQuickMoveToBe = (metric: ILiveOpenTradeMetric) => {
    // True Breakeven covers estimated broker & statutory fees so Net P&L = 0
    const bePrice = metric.trueBreakevenPrice ?? metric.entryPrice;
    const canBroker = metric.dataHealth ? metric.dataHealth.canExecuteBroker : (summary?.dataHealth?.canExecuteBroker ?? true);
    updateSlMutation.mutate({
      tradeId: metric.tradeId,
      newStopLoss: bePrice,
      executeBroker: canBroker,
    });
    if (!canBroker) {
      toast.info(`Updated SL in Journal only (Broker order guarded: ${metric.dataHealth?.brokerExecutionBlockedReason || 'Simulated/Stale'})`);
    }
  };

  // Master 1-Click Action: De-Risk All open positions to True Breakeven with fee cushion
  const handleDeRiskAllPositions = async () => {
    if (!summary?.positions || summary.positions.length === 0) return;
    setIsDeRiskingAll(true);
    const canBroker = summary?.dataHealth?.canExecuteBroker ?? true;
    try {
      let securedCount = 0;

      for (const pos of summary.positions) {
        const isLong = pos.direction === 'LONG';
        const bePrice = pos.trueBreakevenPrice ?? pos.entryPrice;
        const isAtOrBeyondBe =
          pos.stopLoss !== null &&
          (isLong ? pos.stopLoss >= bePrice : pos.stopLoss <= bePrice);

        if (isAtOrBeyondBe) {
          continue;
        }

        await api.trades.liveBrokerSl(pos.tradeId, {
          stopPrice: bePrice,
          executeBroker: canBroker,
          idempotencyKey: `${pos.tradeId}_derisk_all_${Date.now()}`,
        });
        securedCount++;
      }

      soundEngine.playTargetHit();
      if (securedCount > 0) {
        toast.success(
          `🛡️ De-Risk Complete: Secured ${securedCount} position${securedCount > 1 ? 's' : ''} to True Breakeven (+fees protected)${canBroker ? ' on FYERS' : ' in Journal'}!`
        );
      } else {
        toast.info('All open positions are already at or beyond True Breakeven.');
      }
      queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to de-risk all positions');
    } finally {
      setIsDeRiskingAll(false);
    }
  };

  // Scaling Ladder modal state & mutation
  const [selectedLadderStep, setSelectedLadderStep] = useState<{
    step: ILiveTargetLadderStep;
    metric: ILiveOpenTradeMetric;
  } | null>(null);

  // Trade-specific custom rules map (persisted in localStorage)
  const [tradeRulesMap, setTradeRulesMap] = useState<Record<string, ICustomLadderRules>>(() => {
    try {
      const saved = localStorage.getItem('tv_trade_custom_rules_map');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [customRulesMetric, setCustomRulesMetric] = useState<ILiveOpenTradeMetric | null>(null);

  const handleSaveTradeRules = async (tradeId: string, rules: ICustomLadderRules) => {
    setTradeRulesMap((prev) => {
      const next = { ...prev, [tradeId]: rules };
      localStorage.setItem('tv_trade_custom_rules_map', JSON.stringify(next));
      return next;
    });

    try {
      await api.trades.updateLadderRules(tradeId, rules);
    } catch (err: any) {
      console.warn('Failed to sync ladder rules to server:', err?.message);
    }

    toast.success(
      `Saved custom ladder rules${rules.autoExecuteEnabled ? ' (⚡ Auto-Execution to FYERS Armed)' : ''}!`
    );
    queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
  };

  const getEffectiveRules = React.useCallback(
    (tradeId: string, lotSize?: number): ICustomLadderRules => {
      if (tradeRulesMap[tradeId]) {
        return tradeRulesMap[tradeId];
      }
      return createLadderRulesFromSettings(user?.liveWatcherSettings, tradeId, lotSize);
    },
    [tradeRulesMap, user?.liveWatcherSettings]
  );

  // Scalper Hotkeys State [B: Lock BE+Fees | Space: 50% Exit | K: Kill Switch]
  const [scalperHotkeysEnabled, setScalperHotkeysEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tv_scalper_hotkeys');
      if (saved !== null) return saved === 'true';
      return user?.liveWatcherSettings?.scalperHotkeysEnabled ?? false;
    } catch {
      return user?.liveWatcherSettings?.scalperHotkeysEnabled ?? false;
    }
  });

  // Hold-to-Confirm Safety State (requires ~600ms hold on market exits)
  const [requireHoldToConfirm, setRequireHoldToConfirm] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('tv_require_hold_confirm');
      if (saved !== null) return saved === 'true';
      return user?.liveWatcherSettings?.requireHoldToConfirm ?? true;
    } catch {
      return user?.liveWatcherSettings?.requireHoldToConfirm ?? true;
    }
  });

  const handleRecordPulse = async (tradeId: string, emotion: string) => {
    try {
      await api.trades.recordLivePulse(tradeId, emotion);
      toast.success(`Logged "${emotion}" emotional pulse check!`);
      queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record emotional pulse');
    }
  };


  const executedAutoTriggersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('tv_auto_executed_triggers');
      if (saved) {
        executedAutoTriggersRef.current = new Set(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const executeLadderMutation = useMutation({
    mutationFn: async ({
      tradeId,
      targetIndex,
      label,
      exitQty,
      exitPrice,
      newStopLoss,
      executeBroker = true,
      idempotencyKey,
    }: {
      tradeId: string;
      targetIndex: number;
      label: string;
      exitQty: number;
      exitPrice?: number;
      newStopLoss?: number;
      executeBroker?: boolean;
      idempotencyKey?: string;
    }) => {
      return api.trades.liveBrokerLadderStep(tradeId, {
        targetIndex,
        label,
        exitQty,
        exitPrice,
        newStopLoss,
        executeBroker,
        idempotencyKey: idempotencyKey || `${tradeId}_step_${targetIndex}_${Date.now()}`,
      });
    },
    onSuccess: (data: any, variables) => {
      const exitMsg = data?.brokerExitResult?.executedOnBroker
        ? `🟢 FYERS Live: Exited ${variables.exitQty} lots.`
        : `Exited ${variables.exitQty} lots recorded.`;
      const slMsg = data?.brokerSlResult?.executedOnBroker
        ? ` Trailed SL to ₹${variables.newStopLoss} on FYERS.`
        : variables.newStopLoss
        ? ` Trailed SL to ₹${variables.newStopLoss}.`
        : '';
      toast.success(`${exitMsg}${slMsg}`);

      queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setSelectedLadderStep(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to execute ladder step');
    },
  });

  const handleOpenEditSl = (metric: ILiveOpenTradeMetric) => {
    setEditSlMetric(metric);
    setTargetSlPrice(metric.stopLoss !== null ? String(metric.stopLoss) : String(metric.entryPrice));
  };

  const handleIntervalChange = (_: any, newInterval: number | null) => {
    if (newInterval !== null) {
      setRefreshIntervalSec(newInterval);
      localStorage.setItem('tv_live_watcher_interval', String(newInterval));
    }
  };

  const {
    data: summary,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<ILiveWatcherSummary>({
    queryKey: ['live-open-trades-watcher', accountId, queryParams],
    queryFn: () =>
      api.trades.getLiveWatcher(
        accountId && accountId !== 'ALL' ? { ...queryParams, accountId } : queryParams
      ),
    refetchInterval: refreshIntervalSec > 0 ? refreshIntervalSec * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Sync server-persisted customLadderRules into local tradeRulesMap
  useEffect(() => {
    if (summary?.positions) {
      setTradeRulesMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const pos of summary.positions) {
          if (pos.customLadderRules && !next[pos.tradeId]) {
            next[pos.tradeId] = pos.customLadderRules;
            changed = true;
          }
        }
        if (changed) {
          localStorage.setItem('tv_trade_custom_rules_map', JSON.stringify(next));
          return next;
        }
        return prev;
      });
    }
  }, [summary?.positions]);

  // Deterministic Urgency vs Entry-Time Sort
  const sortedPositions = useMemo(() => {
    if (!summary?.positions || summary.positions.length === 0) return [];
    if (sortMode === 'entryTime') return summary.positions;

    return [...summary.positions].sort((a, b) => {
      const getRank = (p: ILiveOpenTradeMetric) => {
        if (p.stopThreatLevel === 'BREACHED') return 1;
        if (p.stopThreatLevel === 'CRITICAL') return 2;
        if (p.giveback?.threatLevel === 'CRITICAL_REVERSAL' || p.giveback?.threatLevel === 'LEAKING') return 3;
        if (p.stopThreatLevel === 'ATTENTION' || p.giveback?.threatLevel === 'WATCH') return 4;
        return 5;
      };

      const rankA = getRank(a);
      const rankB = getRank(b);
      if (rankA !== rankB) return rankA - rankB;

      // Tie break: distance to stop loss in points (closest to SL floats to top)
      const distA = a.distanceToStopPoints ?? Infinity;
      const distB = b.distanceToStopPoints ?? Infinity;
      return distA - distB;
    });
  }, [summary?.positions, sortMode]);

  // Card manual collapse toggle with 60s immunity tracking
  const [expandedChartTrades, setExpandedChartTrades] = useState<Record<string, boolean>>({});
  const handleToggleCardCollapse = (tradeId: string) => {
    setCollapsedCards((prev) => {
      const willCollapse = !prev[tradeId];
      if (willCollapse) {
        manualCollapseTimestamps.current[tradeId] = Date.now();
      } else {
        delete manualCollapseTimestamps.current[tradeId];
      }
      return { ...prev, [tradeId]: willCollapse };
    });
  };

  // Auto-expand high threat trades unless manually collapsed by user within 60s
  useEffect(() => {
    if (!summary?.positions || summary.positions.length === 0) return;

    const now = Date.now();
    setCollapsedCards((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const pos of summary.positions) {
        const isUrgent =
          pos.stopThreatLevel === 'BREACHED' ||
          pos.stopThreatLevel === 'CRITICAL' ||
          pos.giveback?.threatLevel === 'CRITICAL_REVERSAL' ||
          pos.giveback?.threatLevel === 'LEAKING';

        if (isUrgent && next[pos.tradeId]) {
          const manualTime = manualCollapseTimestamps.current[pos.tradeId] || 0;
          if (now - manualTime > 60000) {
            next[pos.tradeId] = false;
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [summary?.positions]);

  // Handle clicking next-action hint button: opens pre-filled dialog (never auto-submits)
  const handleExecuteHint = (pos: ILiveOpenTradeMetric, hint: INextActionHint) => {
    if (hint.dialogType === 'CLOSE_ALL') {
      handleOpenQuickClose(pos, hint.dialogPayload?.suggestedExitRatio ?? 1.0);
    } else if (hint.dialogType === 'PARTIAL_LADDER') {
      const customRules = getEffectiveRules(pos.tradeId, pos.lotSize);
      const effectiveLotSize =
        customRules?.lotSize ||
        pos.lotSize ||
        (pos.contractMultiplier && pos.contractMultiplier > 1 ? pos.contractMultiplier : 1);
      const estCharges = (pos.feeBufferPoints || 0) * (pos.quantity || 1) * (pos.contractMultiplier || 1);

      const effectiveLadder =
        customRules && pos.targetLadder
          ? calculateTargetLadder({
              entryPrice: pos.entryPrice,
              currentLtp: pos.currentLtp,
              direction: pos.direction,
              quantity: pos.quantity,
              contractMultiplier: pos.contractMultiplier,
              initialStopLoss: pos.initialStopLoss,
              initialRiskAmount: pos.initialRiskAmount,
              stopLoss: pos.stopLoss,
              plannedTarget: pos.target,
              tickSize: pos.tickSize,
              lotSize: effectiveLotSize,
              customRules,
              estimatedCharges: estCharges,
            })
          : pos.targetLadder;

      const targetIdx = hint.dialogPayload?.ladderStep === 't1' ? 1 : hint.dialogPayload?.ladderStep === 't2' ? 2 : 3;
      const step = effectiveLadder?.steps.find((s) => s.targetIndex === targetIdx) || effectiveLadder?.steps[0];
      if (step) {
        setSelectedLadderStep({ metric: pos, step });
      } else {
        handleOpenQuickClose(pos, hint.dialogPayload?.suggestedExitRatio ?? 0.5);
      }
    } else if (hint.dialogType === 'CUSTOM_RULES') {
      setCustomRulesMetric(pos);
    }
  };

  // Global Scalper Keyboard Hotkeys Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === '?') {
        e.preventDefault();
        setCheatSheetOpen((prev) => !prev);
        return;
      }

      if (e.key === '1') {
        e.preventDefault();
        setCardDensity('glance');
        localStorage.setItem('tv_live_watcher_card_density', 'glance');
        api.settings.updateProfile({ liveWatcherSettings: { cardDensity: 'glance' } }).catch(() => {});
        toast.info('Switched to Glance Density');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        setCardDensity('standard');
        localStorage.setItem('tv_live_watcher_card_density', 'standard');
        api.settings.updateProfile({ liveWatcherSettings: { cardDensity: 'standard' } }).catch(() => {});
        toast.info('Switched to Standard Density');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        setCardDensity('deep');
        localStorage.setItem('tv_live_watcher_card_density', 'deep');
        api.settings.updateProfile({ liveWatcherSettings: { cardDensity: 'deep' } }).catch(() => {});
        toast.info('Switched to Deep Density');
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        const next = ladderViewMode === 'vertical' ? 'classic' : 'vertical';
        setLadderViewMode(next);
        localStorage.setItem('tv_live_watcher_ladder_view', next);
        api.settings.updateProfile({ liveWatcherSettings: { ladderViewMode: next } }).catch(() => {});
        toast.info(`Switched to ${next === 'vertical' ? 'Vertical Ladder' : 'Classic Gauge'}`);
        return;
      }

      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        const next = sortMode === 'urgency' ? 'entryTime' : 'urgency';
        setSortMode(next);
        localStorage.setItem('tv_live_watcher_sort_mode', next);
        api.settings.updateProfile({ liveWatcherSettings: { sortMode: next } }).catch(() => {});
        toast.info(`Sorting by: ${next === 'urgency' ? 'Urgency' : 'Entry Time'}`);
        return;
      }

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        const curIdx = layoutPresets.findIndex((p) => p.id === activePresetId);
        const nextPreset = layoutPresets[(curIdx + 1) % layoutPresets.length];
        if (nextPreset) applyLayoutPreset(nextPreset);
        return;
      }

      if (!scalperHotkeysEnabled || !summary?.positions?.length) return;

      const topPos = summary.positions[0];
      if (!topPos) return;

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        const bePrice = topPos.trueBreakevenPrice ?? topPos.entryPrice;
        toast.info(`⚡ Hotkey [B]: Locking BE + Fees for ${topPos.symbol} @ ₹${bePrice.toFixed(2)}`);
        handleQuickMoveToBe(topPos);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        toast.info(`⚡ Hotkey [Space]: Triggering 50% quick partial close for ${topPos.symbol}`);
        handleOpenQuickClose(topPos, 0.5);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setKillSwitchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scalperHotkeysEnabled, summary?.positions, ladderViewMode, sortMode, activePresetId, layoutPresets]);

  // Layout Presets Application
  const applyLayoutPreset = (preset: IWatcherLayoutPreset) => {
    setActivePresetId(preset.id);
    setCardDensity(preset.cardDensity);
    setLadderViewMode(preset.ladderViewMode);
    setSortMode(preset.sortMode);
    setRefreshIntervalSec(preset.refreshIntervalSec);
    setScalperHotkeysEnabled(preset.scalperHotkeysEnabled);

    localStorage.setItem('tv_live_watcher_card_density', preset.cardDensity);
    localStorage.setItem('tv_live_watcher_ladder_view', preset.ladderViewMode);
    localStorage.setItem('tv_live_watcher_sort_mode', preset.sortMode);
    localStorage.setItem('tv_live_watcher_interval', String(preset.refreshIntervalSec));
    localStorage.setItem('tv_scalper_hotkeys', String(preset.scalperHotkeysEnabled));

    api.settings.updateProfile({
      liveWatcherSettings: {
        activePresetId: preset.id,
        cardDensity: preset.cardDensity,
        ladderViewMode: preset.ladderViewMode,
        sortMode: preset.sortMode,
        defaultRefreshIntervalSec: preset.refreshIntervalSec,
        scalperHotkeysEnabled: preset.scalperHotkeysEnabled,
      },
    }).catch(() => {});

    toast.info(`Applied layout preset: "${preset.name}" (${preset.cardDensity}, ${preset.refreshIntervalSec}s refresh)`);
  };

  const handleSaveCustomPreset = async () => {
    if (!newPresetName.trim()) return;
    const newPreset: IWatcherLayoutPreset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      refreshIntervalSec,
      cardDensity,
      ladderViewMode,
      sortMode,
      scalperHotkeysEnabled,
      isBuiltIn: false,
    };

    const updatedPresets = [...layoutPresets, newPreset];
    try {
      await api.settings.updateProfile({
        liveWatcherSettings: {
          layoutPresets: updatedPresets,
          activePresetId: newPreset.id,
        },
      });
      setActivePresetId(newPreset.id);
      setSavePresetDialogOpen(false);
      setNewPresetName('');
      toast.success(`Preset "${newPreset.name}" saved successfully`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save layout preset');
    }
  };

  // Pop-Out Picture-in-Picture Handler
  const toggleDocumentPiP = async () => {
    if (isPipActive && pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      setIsPipActive(false);
      return;
    }

    if (typeof window !== 'undefined' && 'documentPictureInPicture' in window) {
      try {
        const pip = await (window as any).documentPictureInPicture.requestWindow({
          width: 440,
          height: 600,
        });

        document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
          pip.document.head.appendChild(node.cloneNode(true));
        });
        pip.document.body.style.margin = '0';
        pip.document.body.style.backgroundColor = '#0b0f19';
        pip.document.body.style.color = '#ffffff';

        pip.addEventListener('pagehide', () => {
          setIsPipActive(false);
          setPipWindow(null);
        });

        setPipWindow(pip);
        setIsPipActive(true);
        toast.success('Mini Watcher popped out into Picture-in-Picture');
      } catch (err: any) {
        toast.error('Could not open Picture-in-Picture: ' + err.message);
      }
    } else {
      window.open(
        window.location.href,
        'SetupMintMiniWatcher',
        'width=440,height=620,menubar=no,toolbar=no,location=no,status=no'
      );
      toast.info('Opened mini watcher in standalone popup window');
    }
  };

  // 3.1 Tab Title & Favicon throttling
  useEffect(() => {
    const link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (link) {
      originalFaviconRef.current = link.href;
    }

    return () => {
      document.title = originalTitleRef.current;
      const fLink: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (fLink && originalFaviconRef.current) {
        fLink.href = originalFaviconRef.current;
      }
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    const delay = Math.max(0, 2500 - (now - lastTitleUpdateRef.current));

    const timeoutId = setTimeout(() => {
      lastTitleUpdateRef.current = Date.now();
      const openCount = summary?.openTradesCount ?? 0;

      if (!summary || openCount === 0) {
        document.title = originalTitleRef.current;
        const link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
        if (link && originalFaviconRef.current) {
          link.href = originalFaviconRef.current;
        }
        return;
      }

      const criticalCount = summary.positions.filter(
        (p) => p.stopThreatLevel === 'CRITICAL' || p.stopThreatLevel === 'BREACHED'
      ).length;

      const netPnL = summary.totalFloatingNetPnL ?? 0;
      const isUsdDom =
        isPropMode ||
        (summary.positions.length > 0 && summary.positions.every((p: any) => p.currency === 'USD'));
      const sym = isUsdDom ? '$' : '₹';
      const pnlPrefix = netPnL >= 0 ? `+${sym}` : `-${sym}`;
      const absPnL = Math.abs(netPnL).toLocaleString(isUsdDom ? 'en-US' : 'en-IN', { maximumFractionDigits: 0 });
      const pnlStr = `${pnlPrefix}${absPnL}`;

      if (criticalCount > 0) {
        document.title = `🚨 ${criticalCount} CRITICAL | ${pnlStr} | SetupMint`;
      } else {
        document.title = `${pnlStr} (${openCount} Pos) | SetupMint`;
      }

      const link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (link) {
        const dotColor = criticalCount > 0 ? '#ef4444' : netPnL >= 0 ? '#10b981' : '#f59e0b';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#0f172a"/><circle cx="16" cy="16" r="8" fill="${dotColor}"/><circle cx="16" cy="16" r="12" fill="none" stroke="${dotColor}" stroke-width="2"/></svg>`;
        link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [summary]);

  // 3.6 Screen Reader Announcements
  useEffect(() => {
    if (!summary?.positions) return;
    for (const pos of summary.positions) {
      const prev = lastThreatAnnouncedRef.current[pos.tradeId];
      if (prev !== pos.stopThreatLevel) {
        lastThreatAnnouncedRef.current[pos.tradeId] = pos.stopThreatLevel;
        if (pos.stopThreatLevel === 'CRITICAL' || pos.stopThreatLevel === 'BREACHED') {
          setAssertiveAnnouncement(`URGENT: ${pos.symbol} stop threat level reached ${pos.stopThreatLevel}. Distance to stop is ${pos.distanceToStopPoints ?? 0} pts.`);
        } else if (pos.stopThreatLevel === 'SAFE') {
          setPoliteAnnouncement(`${pos.symbol} stop threat returned to safe.`);
        }
      }
    }
  }, [summary?.positions]);

  // Auto-Execution Engine: triggers partial exit & SL trail when targets met on armed trades
  useEffect(() => {
    if (!summary?.positions || summary.positions.length === 0) return;

    for (const pos of summary.positions) {
      const rules = getEffectiveRules(pos.tradeId, pos.lotSize);
      if (!rules || !rules.autoExecuteEnabled) continue;

      const lotSize =
        rules.lotSize ||
        pos.lotSize ||
        (pos.contractMultiplier && pos.contractMultiplier > 1 ? pos.contractMultiplier : 1);
      const estCharges = (pos.feeBufferPoints || 0) * (pos.quantity || 1) * (pos.contractMultiplier || 1);

      const ladder = calculateTargetLadder({
        entryPrice: pos.entryPrice,
        currentLtp: pos.currentLtp,
        direction: pos.direction,
        quantity: pos.quantity,
        contractMultiplier: pos.contractMultiplier,
        initialStopLoss: pos.initialStopLoss,
        initialRiskAmount: pos.initialRiskAmount,
        stopLoss: pos.stopLoss,
        plannedTarget: pos.target,
        tickSize: pos.tickSize,
        lotSize,
        customRules: rules,
        estimatedCharges: estCharges,
      });

      if (!ladder || !ladder.steps) continue;

      for (let i = 0; i < ladder.steps.length; i++) {
        const step = ladder.steps[i];
        if (step.isFreeRunner) continue; // Free runner has no fixed target price trigger
        const isLong = pos.direction === 'LONG';
        const isTargetMet =
          step.status === 'MET' ||
          (isLong ? pos.currentLtp >= step.targetPrice : pos.currentLtp <= step.targetPrice);

        if (!isTargetMet) continue;

        const triggerKey = `${pos.tradeId}_${step.name}`;
        if (executedAutoTriggersRef.current.has(triggerKey)) continue;

        // Mark as fired immediately
        executedAutoTriggersRef.current.add(triggerKey);
        try {
          sessionStorage.setItem(
            'tv_auto_executed_triggers',
            JSON.stringify(Array.from(executedAutoTriggersRef.current))
          );
        } catch {}

        // Determine exit qty in exact lot size multiples
        const exitQty =
          step.plannedExitLots && step.plannedExitLots > 0
            ? step.plannedExitLots * lotSize
            : Math.max(lotSize, Math.round((pos.quantity || lotSize) * 0.5));

        // Fire live broker partial exit
        api.trades
          .liveBrokerExit(pos.tradeId, {
            quantity: exitQty,
            exitPrice: pos.currentLtp,
            executeBroker: true,
            idempotencyKey: `${pos.tradeId}_auto_exit_${step.name}_${Date.now()}`,
          })
          .then(() => {
            soundEngine.playTargetHit();
            notificationService.sendNotification(`⚡ FYERS Target Met: ${pos.symbol}`, {
              body: `Hit ${step.name} @ ₹${pos.currentLtp}! Exited ${exitQty} units.`,
            });
            if (step.suggestedStopLoss) {
              api.trades
                .liveBrokerSl(pos.tradeId, {
                  stopPrice: step.suggestedStopLoss,
                  executeBroker: true,
                  idempotencyKey: `${pos.tradeId}_auto_sl_${step.name}_${Date.now()}`,
                })
                .then(() => {
                  toast.success(
                    `⚡ FYERS Auto-Executed: Hit ${step.name} @ ₹${pos.currentLtp}! Exited ${exitQty} units & trailed SL to ₹${step.suggestedStopLoss} (fees protected).`
                  );
                  queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
                  queryClient.invalidateQueries({ queryKey: ['trades'] });
                })
                .catch((slErr: any) => {
                  toast.warning(
                    `⚡ Partial exit executed (${exitQty} units), but SL trailing failed: ${slErr?.message || slErr}`
                  );
                  queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
                });
            } else {
              toast.success(
                `⚡ FYERS Auto-Executed: Hit ${step.name} @ ₹${pos.currentLtp}! Exited ${exitQty} units.`
              );
              queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
              queryClient.invalidateQueries({ queryKey: ['trades'] });
            }
          })
          .catch((exitErr: any) => {
            toast.error(`❌ Auto-execution failed for ${step.name}: ${exitErr?.message || exitErr}`);
            executedAutoTriggersRef.current.delete(triggerKey);
          });
      }

      // 2. Dynamic Step-Trailing Ratchet Engine
      if (rules.dynamicTrailing?.enabled && ladder) {
        const dynEval = calculateDynamicTrailingStop({
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          currentLtp: pos.currentLtp,
          peakLtp: pos.giveback?.peakLtp ?? pos.currentLtp,
          currentStopLoss: pos.stopLoss,
          initialRiskPoints: ladder.initialRiskPoints,
          rule: rules.dynamicTrailing,
        });

        if (dynEval.shouldTrail) {
          const dynKey = `${pos.tradeId}_dyn_sl_${dynEval.newStopPrice}`;
          if (!executedAutoTriggersRef.current.has(dynKey)) {
            executedAutoTriggersRef.current.add(dynKey);
            try {
              sessionStorage.setItem(
                'tv_auto_executed_triggers',
                JSON.stringify(Array.from(executedAutoTriggersRef.current))
              );
            } catch {}

            api.trades
              .liveBrokerSl(pos.tradeId, {
                stopPrice: dynEval.newStopPrice,
                executeBroker: true,
              })
              .then(() => {
                soundEngine.playAutoExecuted();
                notificationService.sendNotification(`⚡ FYERS Dynamic SL Trailed: ${pos.symbol}`, {
                  body: `Ratcheted Stop Loss to ₹${dynEval.newStopPrice} (${dynEval.reason})`,
                });
                toast.success(
                  `⚡ Dynamic Trailing: Ratcheted Stop Loss to ₹${dynEval.newStopPrice} on FYERS! (${dynEval.reason})`
                );
                queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
                queryClient.invalidateQueries({ queryKey: ['trades'] });
              })
              .catch((err: any) => {
                executedAutoTriggersRef.current.delete(dynKey);
                console.error('Dynamic SL trailing failed:', err);
              });
          }
        }
      }

      // 3. Giveback Protection Auto-Exit Engine
      if (rules.givebackAutoExit?.enabled && pos.giveback) {
        const gbEval = evaluateGivebackAutoExit({
          giveback: pos.giveback,
          rule: rules.givebackAutoExit,
        });

        if (gbEval.shouldExit) {
          const gbKey = `${pos.tradeId}_gb_exit`;
          if (!executedAutoTriggersRef.current.has(gbKey)) {
            executedAutoTriggersRef.current.add(gbKey);
            try {
              sessionStorage.setItem(
                'tv_auto_executed_triggers',
                JSON.stringify(Array.from(executedAutoTriggersRef.current))
              );
            } catch {}

            api.trades
              .liveBrokerExit(pos.tradeId, {
                quantity: pos.quantity,
                exitPrice: pos.currentLtp,
                isFullClose: true,
                executeBroker: true,
                idempotencyKey: `${pos.tradeId}_gb_exit_${Date.now()}`,
              })
              .then(() => {
                soundEngine.playGivebackAlert();
                notificationService.sendNotification(`🛡️ FYERS Giveback Auto-Exit: ${pos.symbol}`, {
                  body: `Closed runner position at ₹${pos.currentLtp}! (${gbEval.reason})`,
                });
                toast.warning(
                  `🛡️ Giveback Protection: Closed runner at ₹${pos.currentLtp}! (${gbEval.reason})`
                );
                queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
                queryClient.invalidateQueries({ queryKey: ['trades'] });
              })
              .catch((err: any) => {
                executedAutoTriggersRef.current.delete(gbKey);
                toast.error(`❌ Giveback auto-exit failed: ${err?.message || err}`);
              });
          }
        }
      }

      // 4. Intraday MIS Square-Off Guard (15:14 IST)
      if (rules.misSquareOff?.enabled && istInfo.isMisActionTime) {
        const misKey = `${pos.tradeId}_mis_exit`;
        if (!executedAutoTriggersRef.current.has(misKey)) {
          executedAutoTriggersRef.current.add(misKey);
          try {
            sessionStorage.setItem(
              'tv_auto_executed_triggers',
              JSON.stringify(Array.from(executedAutoTriggersRef.current))
            );
          } catch {}

          api.trades
            .liveBrokerExit(pos.tradeId, {
              quantity: pos.quantity,
              exitPrice: pos.currentLtp,
              isFullClose: true,
              executeBroker: true,
              idempotencyKey: `${pos.tradeId}_mis_exit_${Date.now()}`,
            })
            .then(() => {
              soundEngine.playKillSwitch();
              notificationService.sendNotification(`⏱️ MIS Square-Off: ${pos.symbol}`, {
                body: `Auto-exited at 15:14 IST to avoid broker penalty charges.`,
              });
              toast.info(`⏱️ MIS Auto-Square-Off: Closed ${pos.symbol} at 15:14 IST before broker penalties.`);
              queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
              queryClient.invalidateQueries({ queryKey: ['trades'] });
            })
            .catch((err: any) => {
              executedAutoTriggersRef.current.delete(misKey);
            });
        }
      }

      // 5. Auditory Warning for Critical Stop Loss Threat
      if (pos.stopThreatLevel === 'CRITICAL' || pos.stopThreatLevel === 'BREACHED') {
        const nowMs = Date.now();
        if (nowMs - lastThreatAudioTimeRef.current > 30000) {
          lastThreatAudioTimeRef.current = nowMs;
          soundEngine.playStopThreat();
        }
      }
    }
  }, [summary?.positions, tradeRulesMap, getEffectiveRules, queryClient, istInfo]);

  const handleManualRefetch = async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const openTradesCount = summary?.openTradesCount ?? 0;

  // Don't render anything if 0 open trades and showWhenEmpty is false
  if (!isLoading && openTradesCount === 0 && !showWhenEmpty) {
    return null;
  }

  const isNetProfit = (summary?.totalFloatingNetPnL ?? 0) >= 0;
  const netPnLColor = isNetProfit ? '#10B981' : '#F43F5E';

  const getThreatBadge = (threat: StopThreatLevel) => {
    switch (threat) {
      case 'SAFE':
        return {
          label: 'SAFE',
          color: '#10B981',
          bg: alpha('#10B981', 0.12),
          border: alpha('#10B981', 0.25),
          icon: <ShieldRoundedIcon sx={{ fontSize: 13, mr: 0.5 }} />,
        };
      case 'ATTENTION':
        return {
          label: 'NEAR SL',
          color: '#F59E0B',
          bg: alpha('#F59E0B', 0.12),
          border: alpha('#F59E0B', 0.25),
          icon: <WarningAmberRoundedIcon sx={{ fontSize: 13, mr: 0.5 }} />,
        };
      case 'CRITICAL':
        return {
          label: 'CRITICAL',
          color: '#EF4444',
          bg: alpha('#EF4444', 0.18),
          border: alpha('#EF4444', 0.4),
          icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 13, mr: 0.5 }} />,
        };
      case 'BREACHED':
        return {
          label: 'SL BREACHED',
          color: '#FFFFFF',
          bg: '#DC2626',
          border: '#B91C1C',
          icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 13, mr: 0.5 }} />,
        };
      case 'NO_STOP':
      default:
        return {
          label: 'NO STOP',
          color: '#94A3B8',
          bg: alpha('#94A3B8', 0.1),
          border: alpha('#94A3B8', 0.2),
          icon: null,
        };
    }
  };

  const getDataHealthBadge = (health?: ILiveDataHealth, provider?: string) => {
    if (!health) {
      return {
        label: provider === 'FYERS' ? 'FYERS LIVE' : 'SIMULATION',
        sublabel: '',
        color: provider === 'FYERS' ? '#10B981' : '#F59E0B',
        bg: alpha(provider === 'FYERS' ? '#10B981' : '#F59E0B', 0.12),
        tooltip: 'Waiting for live connection data...',
        isSimulated: provider !== 'FYERS',
        isStale: false,
        canExecuteBroker: provider === 'FYERS',
      };
    }

    if (health.provider === 'SIMULATED') {
      return {
        label: '⚪ SIMULATION FEED',
        sublabel: 'JOURNAL ONLY',
        color: '#F59E0B',
        bg: alpha('#F59E0B', 0.12),
        tooltip: health.brokerExecutionBlockedReason || 'Demo simulation quotes. Broker execution disabled.',
        isSimulated: true,
        isStale: false,
        canExecuteBroker: false,
      };
    }

    if (health.connectionState === 'STALE') {
      return {
        label: `⚠️ STALE DATA (${health.tickAgeSeconds}s)`,
        sublabel: 'EXECUTION PAUSED',
        color: '#EF4444',
        bg: alpha('#EF4444', 0.12),
        tooltip: `Quote feed age (${health.tickAgeSeconds}s) exceeds threshold (${health.staleThresholdSeconds}s). Broker orders disabled to protect against stale fills.`,
        isSimulated: false,
        isStale: true,
        canExecuteBroker: false,
      };
    }

    if (health.connectionState === 'DISCONNECTED') {
      return {
        label: '🔴 DISCONNECTED',
        sublabel: 'NO QUOTES',
        color: '#EF4444',
        bg: alpha('#EF4444', 0.12),
        tooltip: 'No active quote stream received. Broker execution disabled.',
        isSimulated: false,
        isStale: true,
        canExecuteBroker: false,
      };
    }

    if (health.connectionState === 'MARKET_CLOSED') {
      return {
        label: '🌙 MARKET CLOSED',
        sublabel: 'FYERS FEED',
        color: '#64748B',
        bg: alpha('#64748B', 0.12),
        tooltip: 'NSE session closed. Quotes frozen at market close.',
        isSimulated: false,
        isStale: false,
        canExecuteBroker: false,
      };
    }

    const latencyLabel = health.tickAgeSeconds < 1 ? '<1s' : `${health.tickAgeSeconds}s`;
    return {
      label: `🟢 FYERS LIVE (${latencyLabel})`,
      sublabel: health.tokenCountdownStr ? `Token: ${health.tokenCountdownStr}` : 'CONNECTED',
      color: '#10B981',
      bg: alpha('#10B981', 0.12),
      tooltip: `Active exchange quote feed (${latencyLabel} tick latency). Token: ${health.tokenCountdownStr || 'Valid'}.`,
      isSimulated: false,
      isStale: false,
      canExecuteBroker: health.canExecuteBroker,
    };
  };

  const healthBadge = getDataHealthBadge(summary?.dataHealth, summary?.provider);

  const handleOpenQuickClose = async (metric: ILiveOpenTradeMetric, ratio: number = 1.0) => {
    setQuickCloseRatio(ratio);
    const health = metric.dataHealth || summary?.dataHealth;
    try {
      const fullTrade = await api.trades.get(metric.tradeId);
      setQuickCloseTrade({
        ...fullTrade,
        dataHealth: health,
        currentLtp: metric.currentLtp,
      });
      setQuickCloseLtp(metric.currentLtp);
    } catch {
      // Fallback trade object
      setQuickCloseTrade({
        _id: metric.tradeId,
        symbol: metric.symbol,
        direction: metric.direction,
        simpleExecution: {
          entryPrice: metric.entryPrice,
          quantity: metric.quantity,
          contractMultiplier: metric.contractMultiplier,
        },
        quantity: metric.quantity,
        dataHealth: health,
        currentLtp: metric.currentLtp,
      });
      setQuickCloseLtp(metric.currentLtp);
    }
  };

  const getActiveTacticalTab = (pos: ILiveOpenTradeMetric): 'ladder' | 'giveback' | 'greeks' | 'pulse' => {
    if (tacticalTabs[pos.tradeId]) return tacticalTabs[pos.tradeId];
    if (pos.giveback?.threatLevel === 'CRITICAL_REVERSAL' || pos.giveback?.threatLevel === 'LEAKING') {
      return 'giveback';
    }
    if (pos.targetLadder) return 'ladder';
    if (pos.giveback) return 'giveback';
    if (pos.optionsGreeks) return 'greeks';
    return 'ladder';
  };

  const watcherCurrency =
    isPropMode ||
    (summary?.positions?.length && summary.positions.every((p: any) => p.currency === 'USD'))
      ? 'USD'
      : 'INR';
  const currSym = watcherCurrency === 'USD' ? '$' : '₹';

  return (
    <>
      <Card
        sx={{
          mb: 3,
          borderRadius: '16px',
          border: '1px solid',
          borderColor: isDark ? alpha('#3B82F6', 0.25) : alpha('#3B82F6', 0.3),
          background: isDark
            ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%)'
            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            : '0 4px 20px rgba(59, 130, 246, 0.08)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle Top Accent Bar */}
        <Box
          sx={{
            height: '3px',
            background: isNetProfit
              ? 'linear-gradient(90deg, #10B981, #06B6D4)'
              : 'linear-gradient(90deg, #F43F5E, #FB923C)',
          }}
        />

        {/* Header / Summary Bar */}
        <Box
          sx={{
            p: { xs: 1.5, sm: 2 },
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            cursor: 'pointer',
          }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {/* Left: Live Pulse Dot, Title & Consolidated Status Pill */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <Box
              sx={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                bgcolor: refreshIntervalSec > 0 ? '#10B981' : '#94A3B8',
                boxShadow: refreshIntervalSec > 0 ? '0 0 8px #10B981' : 'none',
                animation:
                  refreshIntervalSec > 0
                    ? refreshIntervalSec <= 2
                      ? 'pulseFast 1s infinite'
                      : 'pulse 1.8s infinite'
                    : 'none',
                '@keyframes pulse': {
                  '0%': { transform: 'scale(0.95)', opacity: 0.8 },
                  '50%': { transform: 'scale(1.25)', opacity: 1 },
                  '100%': { transform: 'scale(0.95)', opacity: 0.8 },
                },
                '@keyframes pulseFast': {
                  '0%': { transform: 'scale(0.95)', opacity: 0.85 },
                  '50%': { transform: 'scale(1.35)', opacity: 1 },
                  '100%': { transform: 'scale(0.95)', opacity: 0.85 },
                },
              }}
            />

            <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: -0.2, fontSize: '0.95rem' }}>
              Live Trade Watcher
            </Typography>

            {/* Consolidated Modern Data Health & Provider Status Badges */}
            <Tooltip
              title={
                <Box sx={{ p: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, display: 'block' }}>
                    {healthBadge.label} — {healthBadge.tooltip}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                    • Provider: {summary?.dataHealth?.provider || summary?.provider || 'SIMULATED'}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                    • Connection: {summary?.dataHealth?.connectionState || 'UNKNOWN'}
                  </Typography>
                  {summary?.dataHealth?.tokenCountdownStr && (
                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                      • Broker Session: {summary.dataHealth.isTokenExpired ? 'EXPIRED' : `${summary.dataHealth.tokenCountdownStr} remaining`}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                    • Active Positions: {openTradesCount}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                    • Broker Execution: {healthBadge.canExecuteBroker ? 'ACTIVE & READY' : `BLOCKED (${summary?.dataHealth?.brokerExecutionBlockedReason || 'Simulation / Stale'})`}
                  </Typography>
                </Box>
              }
              arrow
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Chip
                  label={healthBadge.label}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    color: healthBadge.color,
                    bgcolor: healthBadge.bg,
                    border: `1px solid ${alpha(healthBadge.color, 0.35)}`,
                    borderRadius: '6px',
                  }}
                />
                {summary?.dataHealth?.provider === 'FYERS' && summary?.dataHealth?.tokenCountdownStr && (
                  <Chip
                    label={summary.dataHealth.isTokenExpired ? '⚠️ Token Expired' : `🔑 ${summary.dataHealth.tokenCountdownStr}`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      color: summary.dataHealth.isTokenExpired ? '#EF4444' : '#64748B',
                      bgcolor: summary.dataHealth.isTokenExpired ? alpha('#EF4444', 0.12) : alpha('#64748B', 0.08),
                      borderRadius: '4px',
                    }}
                  />
                )}
              </Box>
            </Tooltip>
          </Box>

          {/* Center / Right: Aggregated Live Financials & Actions */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: { xs: 1.5, md: 2 },
              ml: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {openTradesCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {/* Total Floating Net MTM */}
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem', lineHeight: 1 }}>
                    Floating Net MTM
                  </Typography>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 900, color: netPnLColor, letterSpacing: -0.3, lineHeight: 1.2 }}
                  >
                    {isNetProfit ? '+' : ''}
                    {formatCurrency(summary?.totalFloatingNetPnL ?? 0, watcherCurrency)}
                  </Typography>
                </Box>

                {/* Portfolio Unrealized R */}
                {summary?.portfolioUnrealizedR !== null && summary?.portfolioUnrealizedR !== undefined && (
                  <Chip
                    label={`${(summary.portfolioUnrealizedR >= 0 ? '+' : '')}${summary.portfolioUnrealizedR} R`}
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: (summary.portfolioUnrealizedR >= 0 ? '#10B981' : '#F43F5E'),
                      bgcolor: alpha(summary.portfolioUnrealizedR >= 0 ? '#10B981' : '#F43F5E', 0.12),
                      borderRadius: '6px',
                    }}
                  />
                )}
              </Box>
            )}

            {/* View Mode Switcher: Cockpit Cards vs Compact Table */}
            {openTradesCount > 0 && (
              <Tooltip title="Toggle Cockpit Cards vs Compact Table View" arrow>
                <ToggleButtonGroup
                  value={viewMode}
                  exclusive
                  onChange={(_, newMode) => {
                    if (newMode) {
                      setViewMode(newMode);
                      localStorage.setItem('tv_live_watcher_view_mode', newMode);
                    }
                  }}
                  size="small"
                  sx={{
                    height: 28,
                    '& .MuiToggleButton-root': {
                      px: 0.9,
                      py: 0,
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                    },
                  }}
                >
                  <ToggleButton value="cockpit" title="Cockpit Cards">
                    <GridViewRoundedIcon sx={{ fontSize: 14 }} />
                  </ToggleButton>
                  <ToggleButton value="table" title="Compact Table">
                    <TableRowsRoundedIcon sx={{ fontSize: 14 }} />
                  </ToggleButton>
                </ToggleButtonGroup>
              </Tooltip>
            )}

            {/* Density Switcher: Glance (⚡) | Standard (📊) | Deep (🔬) */}
            {openTradesCount > 0 && viewMode === 'cockpit' && (
              <Tooltip title="Card Density: Glance (compact) | Standard | Deep (analytics & Greeks)" arrow>
                <ToggleButtonGroup
                  value={cardDensity}
                  exclusive
                  onChange={(_, newDensity) => {
                    if (newDensity) {
                      setCardDensity(newDensity);
                      localStorage.setItem('tv_live_watcher_card_density', newDensity);
                      api.settings.updateProfile({
                        liveWatcherSettings: { cardDensity: newDensity },
                      }).catch(() => {});
                    }
                  }}
                  size="small"
                  sx={{
                    height: 28,
                    '& .MuiToggleButton-root': {
                      px: 0.9,
                      py: 0,
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      textTransform: 'none',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                    },
                  }}
                >
                  <ToggleButton value="glance" title="Glance (Compact)">
                    <ViewHeadlineRoundedIcon sx={{ fontSize: 13, mr: 0.4 }} />
                    Glance
                  </ToggleButton>
                  <ToggleButton value="standard" title="Standard">
                    <ViewDayRoundedIcon sx={{ fontSize: 13, mr: 0.4 }} />
                    Standard
                  </ToggleButton>
                  <ToggleButton value="deep" title="Deep (Greeks & Radar)">
                    <LayersRoundedIcon sx={{ fontSize: 13, mr: 0.4 }} />
                    Deep
                  </ToggleButton>
                </ToggleButtonGroup>
              </Tooltip>
            )}

            {/* Sort Mode Switcher: Urgency vs Entry Time */}
            {openTradesCount > 1 && (
              <Tooltip title="Sort trades by Urgency (Threat & Proximity to SL) or Entry Time" arrow>
                <ToggleButtonGroup
                  value={sortMode}
                  exclusive
                  onChange={(_, newSort) => {
                    if (newSort) {
                      setSortMode(newSort);
                      localStorage.setItem('tv_live_watcher_sort_mode', newSort);
                      api.settings.updateProfile({
                        liveWatcherSettings: { sortMode: newSort },
                      }).catch(() => {});
                    }
                  }}
                  size="small"
                  sx={{
                    height: 28,
                    '& .MuiToggleButton-root': {
                      px: 0.9,
                      py: 0,
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      textTransform: 'none',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                    },
                  }}
                >
                  <ToggleButton value="urgency" title="Sort by Urgency">
                    <SwapVertRoundedIcon sx={{ fontSize: 13, mr: 0.4 }} />
                    Urgency
                  </ToggleButton>
                  <ToggleButton value="entryTime" title="Sort by Entry Time">
                    <AccessTimeRoundedIcon sx={{ fontSize: 13, mr: 0.4 }} />
                    Time
                  </ToggleButton>
                </ToggleButtonGroup>
              </Tooltip>
            )}

            {/* Unified Ladder View Mode Switcher */}
            {openTradesCount > 0 && viewMode === 'cockpit' && cardDensity !== 'glance' && (
              <Tooltip title="Toggle Tactical Price View: Classic Gauge vs Vertical Ladder" arrow>
                <ToggleButtonGroup
                  value={ladderViewMode}
                  exclusive
                  onChange={(_, newMode) => {
                    if (newMode) {
                      setLadderViewMode(newMode);
                      localStorage.setItem('tv_live_watcher_ladder_view', newMode);
                      api.settings.updateProfile({
                        liveWatcherSettings: { ladderViewMode: newMode },
                      }).catch(() => {});
                    }
                  }}
                  size="small"
                  sx={{
                    height: 28,
                    '& .MuiToggleButton-root': {
                      px: 0.8,
                      py: 0,
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      textTransform: 'none',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                    },
                  }}
                >
                  <ToggleButton value="classic" title="Classic Tactical Range Gauge">
                    Classic
                  </ToggleButton>
                  <ToggleButton value="vertical" title="Vertical Unified Price Ladder">
                    Ladder
                  </ToggleButton>
                </ToggleButtonGroup>
              </Tooltip>
            )}

            {/* Feature 5: Master De-Risk All to True BE Button */}
            {openTradesCount > 0 && (
              <Tooltip title="Master Action: Move stop losses across all open positions to True Breakeven (+statutory fee cushion)" arrow>
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<SecurityRoundedIcon sx={{ fontSize: 13 }} />}
                    onClick={handleDeRiskAllPositions}
                    disabled={isDeRiskingAll}
                    sx={{
                      height: 28,
                      px: 1.2,
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      textTransform: 'none',
                      whiteSpace: 'nowrap',
                      borderColor: '#3B82F6',
                      color: '#3B82F6',
                      bgcolor: alpha('#3B82F6', 0.08),
                      borderRadius: '6px',
                      '&:hover': {
                        bgcolor: alpha('#3B82F6', 0.15),
                        borderColor: '#2563EB',
                      },
                    }}
                  >
                    {isDeRiskingAll ? 'De-Risking...' : 'De-Risk All (BE)'}
                  </Button>
                </span>
              </Tooltip>
            )}

            {/* Emergency Panic Kill Switch */}
            {openTradesCount > 0 && (
              <Tooltip title="🚨 Panic Kill Switch [K]: Instantly market-close all positions on FYERS and cancel all resting stop loss orders" arrow>
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<DangerousRoundedIcon sx={{ fontSize: 14 }} />}
                  onClick={() => setKillSwitchOpen(true)}
                  sx={{
                    height: 28,
                    px: 1.2,
                    fontSize: '0.68rem',
                    fontWeight: 900,
                    bgcolor: '#EF4444',
                    color: '#FFFFFF',
                    borderRadius: '6px',
                    boxShadow: 'none',
                    '&:hover': {
                      bgcolor: '#DC2626',
                      boxShadow: 'none',
                    },
                  }}
                >
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <span>KILL SWITCH</span>
                    <Box
                      component="span"
                      sx={{
                        fontSize: '0.58rem',
                        fontWeight: 800,
                        opacity: 0.9,
                        bgcolor: 'rgba(0,0,0,0.25)',
                        px: 0.5,
                        py: 0.1,
                        borderRadius: '3px',
                        fontFamily: 'monospace',
                      }}
                    >
                      [K]
                    </Box>
                  </Box>
                </Button>
              </Tooltip>
            )}

            {/* In-App Threat Alert Center Bell Badge */}
            <Tooltip title={`Threat Alert Center (${activeAlertsCount} active, Telegram synced)`} arrow>
              <IconButton
                size="small"
                onClick={() => setAlertCenterOpen(true)}
                sx={{
                  width: 28,
                  height: 28,
                  color: urgentAlertsCount > 0 ? '#ef4444' : activeAlertsCount > 0 ? '#f59e0b' : 'inherit',
                }}
              >
                <Badge badgeContent={activeAlertsCount} color="error" max={9}>
                  <NotificationsActiveRoundedIcon sx={{ fontSize: 16 }} />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* Layout Preset Picker Button */}
            <Tooltip title="Watcher Layout Presets: Scalping (1s), Positional (30s), Deep Analytics (5s) [P]" arrow>
              <Button
                size="small"
                variant="outlined"
                onClick={(e) => setPresetMenuAnchor(e.currentTarget)}
                endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 13 }} />}
                sx={{
                  height: 28,
                  px: 1,
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  textTransform: 'none',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
                  borderRadius: '6px',
                }}
              >
                {layoutPresets.find((p) => p.id === activePresetId)?.name || 'Preset'}
              </Button>
            </Tooltip>

            {/* Hotkeys Cheat Sheet Button */}
            <Tooltip title="Keyboard Shortcuts Cheat Sheet [?]" arrow>
              <IconButton
                size="small"
                onClick={() => setCheatSheetOpen(true)}
                sx={{
                  width: 28,
                  height: 28,
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                  borderRadius: '6px',
                }}
              >
                <KeyboardAltRoundedIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>

            {/* Pop-Out Picture-in-Picture Button */}
            <Tooltip title="Pop-Out Mini Watcher (Picture-in-Picture always-on-top window)" arrow>
              <IconButton
                size="small"
                onClick={toggleDocumentPiP}
                sx={{
                  width: 28,
                  height: 28,
                  color: isPipActive ? 'primary.main' : 'inherit',
                  border: '1px solid',
                  borderColor: isPipActive ? 'primary.main' : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                  borderRadius: '6px',
                }}
              >
                <PictureInPictureRoundedIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>

            {/* Manual Refresh Button */}
            <Tooltip title="Refresh quotes now" arrow>
              <IconButton
                size="small"
                onClick={handleManualRefetch}
                sx={{
                  width: 28,
                  height: 28,
                  animation: isManualRefreshing ? 'spin 0.8s linear infinite' : 'none',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }}
              >
                <RefreshRoundedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>

            {/* Settings & Options Menu Popover Button */}
            <Tooltip title="Live Watcher settings: auto-refresh, sound, hotkeys, notifications" arrow>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SettingsRoundedIcon sx={{ fontSize: 13 }} />}
                endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 14 }} />}
                onClick={(e) => setControlsAnchorEl(e.currentTarget)}
                sx={{
                  height: 28,
                  px: 1,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
                  color: 'text.secondary',
                  borderRadius: '6px',
                }}
              >
                {refreshIntervalSec > 0 ? `${refreshIntervalSec}s` : 'Off'}
              </Button>
            </Tooltip>

            {/* Expand / Collapse Chevron */}
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => !prev);
              }}
            >
              {expanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
            </IconButton>
          </Box>
        </Box>

        {/* Settings & Options Dropdown Menu */}
        <Menu
          anchorEl={controlsAnchorEl}
          open={isControlsOpen}
          onClose={() => setControlsAnchorEl(null)}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                p: 1.5,
                minWidth: 260,
                borderRadius: '12px',
                bgcolor: isDark ? '#0F172A' : '#FFFFFF',
                border: `1px solid ${muiTheme.palette.divider}`,
                boxShadow: isDark
                  ? '0 10px 25px -5px rgba(0,0,0,0.5)'
                  : '0 10px 25px -5px rgba(0,0,0,0.1)',
              },
            },
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 800, px: 1, pb: 1, display: 'block', textTransform: 'uppercase', color: 'text.secondary' }}>
            Quote Refresh Rate
          </Typography>
          <Box sx={{ px: 1, pb: 1.5 }}>
            <ToggleButtonGroup
              value={refreshIntervalSec}
              exclusive
              onChange={handleIntervalChange}
              size="small"
              fullWidth
              sx={{
                height: 26,
                '& .MuiToggleButton-root': {
                  px: 0.5,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                },
              }}
            >
              <ToggleButton value={0}>Off</ToggleButton>
              <ToggleButton value={1}>1s</ToggleButton>
              <ToggleButton value={2}>2s</ToggleButton>
              <ToggleButton value={5}>5s</ToggleButton>
              <ToggleButton value={10}>10s</ToggleButton>
              <ToggleButton value={30}>30s</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider sx={{ my: 1 }} />

          {/* Scalper Hotkeys Toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.75 }}>
            <Box>
              <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                Scalper Hotkeys
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', display: 'block' }}>
                [B] Lock BE · [Space] 50% · [K] Panic
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={scalperHotkeysEnabled}
              onChange={() => {
                const next = !scalperHotkeysEnabled;
                setScalperHotkeysEnabled(next);
                localStorage.setItem('tv_scalper_hotkeys', String(next));
                toast.info(next ? '⚡ Scalper Hotkeys Armed: [B] Lock BE | [Space] 50% | [K] Kill' : 'Hotkeys Disabled');
              }}
            />
          </Box>

          {/* Hold-to-Confirm Exits (~600ms) */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.75 }}>
            <Box>
              <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                Hold-to-Confirm Exits
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', display: 'block' }}>
                ~600ms press ring to prevent mis-clicks
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={requireHoldToConfirm}
              onChange={() => {
                const next = !requireHoldToConfirm;
                setRequireHoldToConfirm(next);
                localStorage.setItem('tv_require_hold_confirm', String(next));
                toast.info(next ? '🛡️ Hold-to-Confirm Armed (600ms safety ring)' : 'Hold-to-Confirm Disabled');
              }}
            />
          </Box>

          {/* Audio Alert Chimes */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.75 }}>
            <Box>
              <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                Audio Alert Chimes
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', display: 'block' }}>
                Sounds on target and stop alerts
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={soundEnabled}
              onChange={handleToggleSound}
            />
          </Box>

          {/* Desktop Web Notifications */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.75 }}>
            <Box>
              <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>
                Desktop Notifications
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', display: 'block' }}>
                Push popups for execution alerts
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={notificationsEnabled}
              onChange={handleToggleNotifications}
            />
          </Box>

          <Divider sx={{ my: 1 }} />

          {/* MIS Countdown Readout */}
          <Box sx={{ px: 1, py: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTimeRoundedIcon sx={{ fontSize: 13 }} />
              MIS Square-Off:
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 800, color: istInfo.isMisCriticalWindow ? '#EF4444' : 'text.primary' }}>
              {istInfo.isMarketOpen ? `MIS ${istInfo.countdownStr || '00:00:00'}` : 'Market Closed'}
            </Typography>
          </Box>
        </Menu>

        {/* Layout Presets Dropdown Menu */}
        <Menu
          anchorEl={presetMenuAnchor}
          open={Boolean(presetMenuAnchor)}
          onClose={() => setPresetMenuAnchor(null)}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                p: 1,
                minWidth: 240,
                borderRadius: '12px',
                bgcolor: isDark ? '#0F172A' : '#FFFFFF',
                border: `1px solid ${muiTheme.palette.divider}`,
                boxShadow: isDark
                  ? '0 10px 25px -5px rgba(0,0,0,0.5)'
                  : '0 10px 25px -5px rgba(0,0,0,0.1)',
              },
            },
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 800, px: 1, pb: 0.5, display: 'block', textTransform: 'uppercase', color: 'text.secondary', fontSize: '0.65rem' }}>
            Watcher Layout Presets [P]
          </Typography>
          {layoutPresets.map((preset) => {
            const isSelected = preset.id === activePresetId;
            return (
              <MenuItem
                key={preset.id}
                onClick={() => {
                  applyLayoutPreset(preset);
                  setPresetMenuAnchor(null);
                }}
                selected={isSelected}
                sx={{
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 0.75,
                  fontSize: '0.8rem',
                  fontWeight: isSelected ? 800 : 500,
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: isSelected ? 800 : 600, fontSize: '0.8rem' }}>
                    {preset.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', display: 'block' }}>
                    {preset.cardDensity.toUpperCase()} · {preset.refreshIntervalSec}s · {preset.ladderViewMode === 'vertical' ? 'Ladder' : 'Gauge'}
                  </Typography>
                </Box>
                {isSelected && <CheckCircleRoundedIcon sx={{ fontSize: 16, color: '#10b981' }} />}
              </MenuItem>
            );
          })}
          <Divider sx={{ my: 1 }} />
          <MenuItem
            onClick={() => {
              setPresetMenuAnchor(null);
              setNewPresetName('');
              setSavePresetDialogOpen(true);
            }}
            sx={{ borderRadius: 1, py: 0.75, fontSize: '0.78rem', fontWeight: 700, color: 'primary.main' }}
          >
            + Save Current View as Preset
          </MenuItem>
        </Menu>

        {/* Collapsible Open Trade Cards Grid */}
        <Collapse in={expanded}>
          {/* Data Health & Provider Mode Notice */}
          {summary?.dataHealth?.provider === 'SIMULATED' && (
            <Box
              sx={{
                px: 2,
                py: 1.2,
                mx: 2,
                mt: 1.5,
                borderRadius: 2,
                bgcolor: alpha('#F59E0B', 0.08),
                border: `1px solid ${alpha('#F59E0B', 0.25)}`,
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
              }}
            >
              <WarningAmberRoundedIcon sx={{ color: '#F59E0B', fontSize: 18 }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: isDark ? '#FDE68A' : '#92400E' }}>
                <strong>Simulation Mode Active:</strong> Quotes are simulated for testing & strategy design. Real broker order execution is safely disabled. All actions update SetupMint journal records only.
              </Typography>
            </Box>
          )}

          {summary?.dataHealth?.isStale && (
            <Box
              sx={{
                px: 2,
                py: 1.2,
                mx: 2,
                mt: 1.5,
                borderRadius: 2,
                bgcolor: alpha('#EF4444', 0.08),
                border: `1px solid ${alpha('#EF4444', 0.3)}`,
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
              }}
            >
              <ErrorOutlineRoundedIcon sx={{ color: '#EF4444', fontSize: 18 }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: isDark ? '#FCA5A5' : '#991B1B' }}>
                <strong>Stale Market Quotes ({summary.dataHealth.tickAgeSeconds}s old):</strong> Market feed has exceeded your {summary.dataHealth.staleThresholdSeconds}s safety threshold. Live broker execution is paused to protect against slippage on stale prices.
              </Typography>
            </Box>
          )}

          {summary?.dataHealth?.isTokenExpired && (
            <Box
              sx={{
                px: 2,
                py: 1.2,
                mx: 2,
                mt: 1.5,
                borderRadius: 2,
                bgcolor: alpha('#EF4444', 0.08),
                border: `1px solid ${alpha('#EF4444', 0.3)}`,
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
              }}
            >
              <WarningAmberRoundedIcon sx={{ color: '#EF4444', fontSize: 18 }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: isDark ? '#FCA5A5' : '#991B1B' }}>
                <strong>FYERS Session Expired:</strong> Your broker access token has expired. Live broker execution is disabled. Reconnect your broker in Settings to restore live order routing.
              </Typography>
            </Box>
          )}

          {/* Daily Floating Loss Circuit Breaker Warning */}
          {summary && summary.totalFloatingNetPnL !== undefined && summary.totalFloatingNetPnL <= -maxDailyLoss && (
            <Box
              sx={{
                p: 1.5,
                mx: 2,
                mt: 2,
                borderRadius: 2,
                bgcolor: alpha('#EF4444', 0.12),
                border: '2px solid #EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <DangerousRoundedIcon sx={{ color: '#EF4444', fontSize: 28 }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#EF4444' }}>
                    🚨 DAILY FLOATING LOSS CIRCUIT BREAKER BREACHED!
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Floating drawdown ({formatCurrency(summary.totalFloatingNetPnL)}) exceeds your max risk limit ({formatCurrency(maxDailyLoss)}). Consider flattening positions.
                  </Typography>
                </Box>
              </Box>
              <Button
                variant="contained"
                color="error"
                size="small"
                startIcon={<DangerousRoundedIcon />}
                onClick={() => setKillSwitchOpen(true)}
                sx={{ fontWeight: 800, px: 2, bgcolor: '#DC2626' }}
              >
                FLATTEN ALL NOW
              </Button>
            </Box>
          )}
          <Box
            sx={{
              p: { xs: 2, sm: 2.5 },
              pt: 0,
              borderTop: '1px solid',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
            }}
          >
            {isLoading ? (
              <Grid container spacing={2} sx={{ pt: 2 }}>
                {[1, 2].map((i) => (
                  <Grid size={{ xs: 12, md: 6 }} key={i}>
                    <Skeleton variant="rounded" height={160} sx={{ borderRadius: '12px' }} />
                  </Grid>
                ))}
              </Grid>
            ) : openTradesCount === 0 ? (
              <Box sx={{ py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No open positions currently active. Open trades will automatically appear here with real-time MTM and risk gauges.
                </Typography>
              </Box>
            ) : (
              <>
                {summary?.portfolioRisk && summary.positions.length > 0 && (
                  <Box sx={{ pt: 2 }}>
                    <LivePortfolioRiskBanner
                      risk={summary.portfolioRisk}
                      isDark={isDark}
                      riskSettings={user?.riskSettings}
                      summary={summary}
                      isPropMode={isPropMode}
                      propRuleDailyLossLimit={propDailyLossLimit}
                      propRuleRemainingBuffer={propRemainingBuffer}
                    />
                  </Box>
                )}
                {viewMode === 'table' ? (
              /* DENSE TABLE VIEW: Ultra-compact, 1-row per trade, zero scrolling */
              <TableContainer sx={{ pt: 1.5, overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 840 }}>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& th': {
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          color: 'text.secondary',
                          textTransform: 'uppercase',
                          letterSpacing: 0.3,
                          py: 1,
                          borderBottom: '1px solid',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                        },
                      }}
                    >
                      <TableCell>Instrument & Side</TableCell>
                      <TableCell>Entry vs LTP</TableCell>
                      <TableCell>Floating Net MTM</TableCell>
                      <TableCell>Stop Loss & Buffer</TableCell>
                      <TableCell>Target & Ladder</TableCell>
                      <TableCell>Giveback Radar</TableCell>
                      <TableCell align="right" sx={{ minWidth: 330, width: 330, whiteSpace: 'nowrap' }}>Quick Cockpit Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedPositions.map((pos) => {
                      const isLong = pos.direction === 'LONG';
                      const threat = getThreatBadge(pos.stopThreatLevel);
                      const isPosProfitable = pos.floatingNetPnL >= 0;
                      const posPnLColor = isPosProfitable ? '#10B981' : '#F43F5E';
                      const isOneToOne = pos.unrealizedR !== null && pos.unrealizedR >= 1.0;
                      const isAtOrBeyondBe =
                        pos.stopLoss !== null &&
                        (isLong ? pos.stopLoss >= pos.entryPrice : pos.stopLoss <= pos.entryPrice);

                      const customRules = getEffectiveRules(pos.tradeId, pos.lotSize);
                      const effectiveLotSize =
                        customRules?.lotSize ||
                        pos.lotSize ||
                        (pos.contractMultiplier && pos.contractMultiplier > 1 ? pos.contractMultiplier : 1);
                      const estCharges =
                        (pos.feeBufferPoints || 0) * (pos.quantity || 1) * (pos.contractMultiplier || 1);
                      const effectiveLadder =
                        customRules && pos.targetLadder
                          ? calculateTargetLadder({
                              entryPrice: pos.entryPrice,
                              currentLtp: pos.currentLtp,
                              direction: pos.direction,
                              quantity: pos.quantity,
                              contractMultiplier: pos.contractMultiplier,
                              initialStopLoss: pos.initialStopLoss,
                              initialRiskAmount: pos.initialRiskAmount,
                              stopLoss: pos.stopLoss,
                              plannedTarget: pos.target,
                              tickSize: pos.tickSize,
                              lotSize: effectiveLotSize,
                              customRules,
                              estimatedCharges: estCharges,
                            })
                          : pos.targetLadder;

                      const activeLadderStep =
                        effectiveLadder?.steps.find((s) => s.status === 'MET') ||
                        effectiveLadder?.steps.find((s) => s.status === 'IN_PROGRESS') ||
                        effectiveLadder?.steps[0];

                      return (
                        <TableRow
                          key={pos.tradeId}
                          hover
                          sx={{
                            '& td': {
                              py: 1.25,
                              borderBottom: '1px solid',
                              borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                            },
                            opacity: pos.dataHealth?.isStale ? 0.8 : 1,
                            bgcolor: pos.dataHealth?.isStale
                              ? alpha('#EF4444', isDark ? 0.08 : 0.04)
                              : isOneToOne
                              ? alpha('#10B981', isDark ? 0.05 : 0.03)
                              : 'transparent',
                          }}
                        >
                          {/* Instrument & Side */}
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'nowrap' }}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  '&:hover': { color: '#3B82F6', textDecoration: 'underline' },
                                }}
                                onClick={() => navigate(`/trades/${pos.tradeId}`)}
                              >
                                {pos.symbol}
                              </Typography>
                              <Chip
                                label={pos.direction}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.62rem',
                                  fontWeight: 800,
                                  color: isLong ? '#10B981' : '#A855F7',
                                  bgcolor: alpha(isLong ? '#10B981' : '#A855F7', 0.12),
                                  borderRadius: '4px',
                                }}
                              />
                              {pos.quantity !== undefined && pos.quantity > 0 && (
                                <Chip
                                  label={`${pos.quantity} Qty`}
                                  size="small"
                                  sx={{
                                    height: 18,
                                    fontSize: '0.62rem',
                                    fontWeight: 700,
                                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                                    borderRadius: '4px',
                                  }}
                                />
                              )}
                              {pos.dataHealth?.isStale && (
                                <Tooltip title={`Stale quote (${pos.dataHealth.tickAgeSeconds}s old). Broker execution guarded.`} arrow>
                                  <Chip
                                    label={`STALE ${pos.dataHealth.tickAgeSeconds}s`}
                                    size="small"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.55rem',
                                      fontWeight: 800,
                                      color: '#EF4444',
                                      bgcolor: alpha('#EF4444', 0.15),
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      borderRadius: '4px',
                                    }}
                                  />
                                </Tooltip>
                              )}
                              {pos.dataHealth?.provider === 'SIMULATED' && !pos.dataHealth?.isStale && (
                                <Chip
                                  label="SIM"
                                  size="small"
                                  sx={{
                                    height: 18,
                                    fontSize: '0.55rem',
                                    fontWeight: 800,
                                    color: '#F59E0B',
                                    bgcolor: alpha('#F59E0B', 0.12),
                                    borderRadius: '4px',
                                  }}
                                />
                              )}
                              {customRules?.autoExecuteEnabled && (
                                <Tooltip title="Auto-Execution to FYERS Active" arrow>
                                  <Chip
                                    label="⚡ AUTO"
                                    size="small"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.58rem',
                                      fontWeight: 800,
                                      color: '#10B981',
                                      bgcolor: alpha('#10B981', 0.15),
                                      border: '1px solid rgba(16, 185, 129, 0.3)',
                                      borderRadius: '4px',
                                    }}
                                  />
                                </Tooltip>
                              )}
                              {pos.stagnation?.isStagnant && (
                                <Tooltip title={`${pos.stagnation.message} (Velocity: ₹${pos.stagnation.pnlVelocityPerMinute}/min)`} arrow>
                                  <Chip
                                    label="STALLED"
                                    size="small"
                                    sx={{
                                      height: 18,
                                      fontSize: '0.58rem',
                                      fontWeight: 800,
                                      color: '#F59E0B',
                                      bgcolor: alpha('#F59E0B', 0.15),
                                      border: '1px solid rgba(245, 158, 11, 0.3)',
                                      borderRadius: '4px',
                                    }}
                                  />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>

                          {/* Entry vs LTP */}
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                    {currSym}{pos.currentLtp}
                                  </Typography>
                                  {pos.priceDeltaPoints >= 0 ? (
                                    <TrendingUpRoundedIcon sx={{ fontSize: 14, color: '#10B981' }} />
                                  ) : (
                                    <TrendingDownRoundedIcon sx={{ fontSize: 14, color: '#F43F5E' }} />
                                  )}
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                  Entry: {currSym}{pos.entryPrice} ({pos.priceDeltaPoints >= 0 ? '+' : ''}{pos.priceDeltaPoints} pts)
                                </Typography>
                              </Box>
                              {pos.sparkline && (
                                <LiveSparkline points={pos.sparkline} isDark={isDark} width={70} height={22} />
                              )}
                            </Box>
                          </TableCell>

                          {/* Floating Net MTM */}
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: posPnLColor }}>
                              {isPosProfitable ? '+' : ''}
                              {formatCurrency(pos.floatingNetPnL, (pos as any).currency || watcherCurrency)}
                            </Typography>
                            {pos.unrealizedR !== null && (
                              <Chip
                                label={`${pos.unrealizedR >= 0 ? '+' : ''}${pos.unrealizedR} R`}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.62rem',
                                  fontWeight: 800,
                                  color: posPnLColor,
                                  bgcolor: alpha(posPnLColor, 0.12),
                                  borderRadius: '4px',
                                }}
                              />
                            )}
                          </TableCell>

                          {/* Stop Loss & Buffer */}
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                                {pos.stopLoss !== null ? `₹${pos.stopLoss}` : 'None'}
                              </Typography>
                              <Chip
                                label={threat.label}
                                size="small"
                                sx={{
                                  height: 16,
                                  fontSize: '0.58rem',
                                  fontWeight: 800,
                                  color: threat.color,
                                  bgcolor: threat.bg,
                                  borderRadius: '3px',
                                }}
                              />
                              {!isAtOrBeyondBe && pos.stopLoss !== null && (
                                <Tooltip
                                  title={
                                    pos.trueBreakevenPrice
                                      ? `Lock True Breakeven @ ₹${pos.trueBreakevenPrice} (covers all fees)`
                                      : 'Quick Lock Breakeven Stop'
                                  }
                                  arrow
                                >
                                  <IconButton
                                    size="small"
                                    onClick={() => handleQuickMoveToBe(pos)}
                                    disabled={updateSlMutation.isPending}
                                    sx={{ p: 0.25, color: '#3B82F6' }}
                                  >
                                    <LockRoundedIcon sx={{ fontSize: 13 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                            {pos.distanceToStopPoints !== null && (
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                Buffer: <strong style={{ color: threat.color }}>{pos.distanceToStopPoints > 0 ? `${pos.distanceToStopPoints} pts` : 'Breached'}</strong>
                              </Typography>
                            )}
                            {pos.isNakedPosition || !pos.hasRestingBrokerSl ? (
                              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Chip
                                  label="NAKED"
                                  size="small"
                                  sx={{
                                    height: 16,
                                    fontSize: '0.55rem',
                                    fontWeight: 800,
                                    color: '#EF4444',
                                    bgcolor: alpha('#EF4444', 0.15),
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '3px',
                                  }}
                                />
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  onClick={() => {
                                    const slToArm = pos.stopLoss ?? pos.entryPrice;
                                    api.trades
                                      .liveBrokerSl(pos.tradeId, {
                                        stopPrice: slToArm,
                                        executeBroker: true,
                                        idempotencyKey: `${pos.tradeId}_arm_sl_${Date.now()}`,
                                      })
                                      .then(() => {
                                        toast.success(`Protection SL armed on FYERS @ ₹${slToArm}`);
                                        queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
                                      })
                                      .catch((err: any) => {
                                        toast.error(err?.message || 'Failed to place resting SL');
                                      });
                                  }}
                                  sx={{
                                    height: 18,
                                    fontSize: '0.55rem',
                                    fontWeight: 800,
                                    py: 0,
                                    px: 0.6,
                                    minWidth: 'auto',
                                    textTransform: 'none',
                                  }}
                                >
                                  Arm SL
                                </Button>
                              </Box>
                            ) : (
                              <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', color: '#10B981', fontWeight: 700 }}>
                                ✓ Exchange SL Resting
                              </Typography>
                            )}
                          </TableCell>

                          {/* Target & Ladder */}
                          <TableCell>
                            {activeLadderStep ? (
                              <Box sx={{ minWidth: 120 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem', color: activeLadderStep.status === 'MET' ? '#10B981' : '#3B82F6' }}>
                                    {activeLadderStep.name}
                                  </Typography>
                                  {activeLadderStep.isActionable && (
                                    <Button
                                      size="small"
                                      variant="contained"
                                      onClick={() => setSelectedLadderStep({ step: activeLadderStep, metric: pos })}
                                      sx={{
                                        height: 18,
                                        fontSize: '0.58rem',
                                        fontWeight: 800,
                                        py: 0,
                                        px: 0.75,
                                        textTransform: 'none',
                                        bgcolor: '#10B981',
                                        '&:hover': { bgcolor: '#059669' },
                                        borderRadius: '3px',
                                      }}
                                    >
                                      Execute
                                    </Button>
                                  )}
                                </Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={Math.min(100, Math.max(0, activeLadderStep.progressPercent))}
                                  sx={{
                                    height: 3,
                                    borderRadius: 2,
                                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                                    '& .MuiLinearProgress-bar': { bgcolor: activeLadderStep.status === 'MET' ? '#10B981' : '#3B82F6' },
                                  }}
                                />
                              </Box>
                            ) : pos.target !== null ? (
                              <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
                                ₹{pos.target} ({pos.targetProgressPercent ?? 0}%)
                              </Typography>
                            ) : (
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                Not set
                              </Typography>
                            )}
                          </TableCell>

                          {/* Giveback Radar */}
                          <TableCell>
                            {pos.giveback ? (
                              <Tooltip
                                title={`Peak MTM: +₹${pos.giveback.peakFloatingNetPnL} (+${pos.giveback.peakUnrealizedR}R) | Retained: ${pos.giveback.retentionPercent}%`}
                                arrow
                              >
                                <Chip
                                  label={
                                    pos.giveback.threatLevel === 'CRITICAL_REVERSAL'
                                      ? 'REVERSAL'
                                      : pos.giveback.threatLevel === 'LEAKING'
                                      ? `${pos.giveback.givebackPercent}% LEAK`
                                      : `${pos.giveback.retentionPercent}% HELD`
                                  }
                                  size="small"
                                  sx={{
                                    height: 18,
                                    fontSize: '0.6rem',
                                    fontWeight: 800,
                                    color:
                                      pos.giveback.threatLevel === 'CRITICAL_REVERSAL'
                                        ? '#EF4444'
                                        : pos.giveback.threatLevel === 'LEAKING'
                                        ? '#F59E0B'
                                        : '#10B981',
                                    bgcolor: alpha(
                                      pos.giveback.threatLevel === 'CRITICAL_REVERSAL'
                                        ? '#EF4444'
                                        : pos.giveback.threatLevel === 'LEAKING'
                                        ? '#F59E0B'
                                        : '#10B981',
                                      0.12
                                    ),
                                    borderRadius: '4px',
                                  }}
                                />
                              </Tooltip>
                            ) : (
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                -
                              </Typography>
                            )}
                          </TableCell>

                          {/* Quick Cockpit Actions */}
                          <TableCell align="right" sx={{ minWidth: 330, width: 330, whiteSpace: 'nowrap' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, flexWrap: 'nowrap' }}>
                              <Tooltip
                                title={
                                  pos.dataHealth && !pos.dataHealth.canExecuteBroker
                                    ? `Broker market orders guarded: ${pos.dataHealth.brokerExecutionBlockedReason || 'Simulation / Stale'}. Opens Journal close.`
                                    : 'Book 50% partial profit at current LTP'
                                }
                                arrow
                              >
                                <span>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleOpenQuickClose(pos, 0.5)}
                                    sx={{
                                      height: 26,
                                      px: 1.25,
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      textTransform: 'none',
                                      whiteSpace: 'nowrap',
                                      minWidth: 'max-content',
                                      lineHeight: 1,
                                      borderRadius: '5px',
                                      borderColor: '#10B981',
                                      color: '#10B981',
                                      '&:hover': { bgcolor: alpha('#10B981', 0.1) },
                                    }}
                                  >
                                    Book 50%
                                  </Button>
                                </span>
                              </Tooltip>
                              <Tooltip
                                title={
                                  pos.dataHealth && !pos.dataHealth.canExecuteBroker
                                    ? `Broker market orders guarded: ${pos.dataHealth.brokerExecutionBlockedReason || 'Simulation / Stale'}. Opens Journal close.`
                                    : 'Close 100% full position at current LTP'
                                }
                                arrow
                              >
                                <span>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => handleOpenQuickClose(pos, 1.0)}
                                    sx={{
                                      height: 26,
                                      px: 1.25,
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      textTransform: 'none',
                                      whiteSpace: 'nowrap',
                                      minWidth: 'max-content',
                                      lineHeight: 1,
                                      borderRadius: '5px',
                                      bgcolor: '#EF4444',
                                      color: '#FFFFFF',
                                      '&:hover': { bgcolor: '#DC2626' },
                                    }}
                                  >
                                    Close 100%
                                  </Button>
                                </span>
                              </Tooltip>
                              <Tooltip
                                title={
                                  pos.trueBreakevenPrice
                                    ? `Lock True Breakeven @ ₹${pos.trueBreakevenPrice} (covers all fees: +${pos.feeBufferPoints || 0} pts)`
                                    : `Lock Breakeven @ ₹${pos.entryPrice}`
                                }
                                arrow
                              >
                                <span>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<LockRoundedIcon sx={{ fontSize: 11 }} />}
                                    onClick={() => handleQuickMoveToBe(pos)}
                                    disabled={isAtOrBeyondBe || updateSlMutation.isPending}
                                    sx={{
                                      height: 26,
                                      px: 1,
                                      fontSize: '0.65rem',
                                      fontWeight: 700,
                                      textTransform: 'none',
                                      whiteSpace: 'nowrap',
                                      minWidth: 'max-content',
                                      lineHeight: 1,
                                      borderColor: isAtOrBeyondBe ? 'rgba(16, 185, 129, 0.4)' : '#3B82F6',
                                      color: isAtOrBeyondBe ? '#10B981' : '#3B82F6',
                                      bgcolor: isAtOrBeyondBe ? alpha('#10B981', 0.08) : 'transparent',
                                      '&:hover': {
                                        bgcolor: alpha('#3B82F6', 0.1),
                                        borderColor: '#2563EB',
                                      },
                                      borderRadius: '5px',
                                    }}
                                  >
                                    {isAtOrBeyondBe ? 'BE Locked' : 'Lock BE+Fees'}
                                  </Button>
                                </span>
                              </Tooltip>
                              <Tooltip title="Configure Custom R1-R3, Lots & Auto-Execution" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => setCustomRulesMetric(pos)}
                                  sx={{
                                    p: 0.5,
                                    border: '1px solid',
                                    borderColor: customRules?.autoExecuteEnabled
                                      ? '#10B981'
                                      : isDark
                                      ? 'rgba(255, 255, 255, 0.12)'
                                      : 'rgba(0, 0, 0, 0.12)',
                                    bgcolor: customRules?.autoExecuteEnabled
                                      ? alpha('#10B981', 0.12)
                                      : 'transparent',
                                    borderRadius: '5px',
                                    color: customRules?.autoExecuteEnabled ? '#10B981' : 'text.secondary',
                                    '&:hover': {
                                      borderColor: '#3B82F6',
                                      color: '#3B82F6',
                                    },
                                  }}
                                >
                                  <TuneRoundedIcon sx={{ fontSize: 13 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Adjust Stop Loss Price" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => handleOpenEditSl(pos)}
                                  sx={{
                                    p: 0.5,
                                    border: '1px solid',
                                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
                                    borderRadius: '5px',
                                  }}
                                >
                                  <ShieldRoundedIcon sx={{ fontSize: 13, color: '#3B82F6' }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              /* OPTION A COCKPIT CARDS: Split 2-Column Wide Cards with Top-Mounted Quick Action Cockpit */
              <Grid container spacing={2} sx={{ pt: 2 }}>
                {sortedPositions.map((pos) => {
                  const isLong = pos.direction === 'LONG';
                  const threat = getThreatBadge(pos.stopThreatLevel);
                  const isPosProfitable = pos.floatingNetPnL >= 0;
                  const posPnLColor = isPosProfitable ? '#10B981' : '#F43F5E';
                  const isOneToOne = pos.unrealizedR !== null && pos.unrealizedR >= 1.0;
                  const isAtOrBeyondBe =
                    pos.stopLoss !== null &&
                    (isLong ? pos.stopLoss >= pos.entryPrice : pos.stopLoss <= pos.entryPrice);

                  const isGlance = cardDensity === 'glance';
                  const isDeep = cardDensity === 'deep';
                  const isCardCollapsed = Boolean(collapsedCards[pos.tradeId]);
                  const nextHint = pos.nextActionHint ?? selectNextActionHint(pos);

                  const customRules = getEffectiveRules(pos.tradeId, pos.lotSize);
                  const effectiveLotSize =
                    customRules?.lotSize ||
                    pos.lotSize ||
                    (pos.contractMultiplier && pos.contractMultiplier > 1 ? pos.contractMultiplier : 1);
                  const estCharges =
                    (pos.feeBufferPoints || 0) * (pos.quantity || 1) * (pos.contractMultiplier || 1);
                  const effectiveLadder =
                    customRules && pos.targetLadder
                      ? calculateTargetLadder({
                          entryPrice: pos.entryPrice,
                          currentLtp: pos.currentLtp,
                          direction: pos.direction,
                          quantity: pos.quantity,
                          contractMultiplier: pos.contractMultiplier,
                          initialStopLoss: pos.initialStopLoss,
                          initialRiskAmount: pos.initialRiskAmount,
                          stopLoss: pos.stopLoss,
                          plannedTarget: pos.target,
                          tickSize: pos.tickSize,
                          lotSize: effectiveLotSize,
                          customRules,
                          estimatedCharges: estCharges,
                        })
                      : pos.targetLadder;

                  const activeTacticalTab = getActiveTacticalTab(pos);

                  const multiplier = pos.contractMultiplier && pos.contractMultiplier > 0 ? pos.contractMultiplier : 1;
                  const notionalExposure = (pos.quantity || 1) * multiplier * pos.currentLtp;
                  const initialRiskAmount =
                    pos.initialRiskAmount ??
                    (pos.stopLoss !== null
                      ? Math.abs(pos.entryPrice - pos.stopLoss) * (pos.quantity || 1) * multiplier
                      : null);

                  const initialRiskPts =
                    effectiveLadder?.initialRiskPoints ??
                    pos.targetLadder?.initialRiskPoints ??
                    (pos.stopLoss !== null ? Math.abs(pos.entryPrice - pos.stopLoss) : null);

                  const stopSafetyPercent =
                    initialRiskPts && initialRiskPts > 0 && pos.distanceToStopPoints !== null
                      ? Math.min(100, Math.max(0, (pos.distanceToStopPoints / initialRiskPts) * 100))
                      : null;

                  const nextLadderMilestone =
                    effectiveLadder?.steps.find((s) => s.status === 'IN_PROGRESS' || s.isActionable) ||
                    effectiveLadder?.steps.find((s) => s.status === 'PENDING') ||
                    effectiveLadder?.steps[0];

                  const isStale = pos.dataHealth?.isStale;
                  const isSimulated = pos.dataHealth?.provider === 'SIMULATED';

                  return (
                    <Grid
                      size={{
                        xs: 12,
                        md: isDeep || openTradesCount === 1 ? 12 : 6,
                        lg: isDeep || openTradesCount === 1 ? 12 : openTradesCount === 2 ? 6 : isGlance ? 4 : 6,
                      }}
                      key={pos.tradeId}
                    >
                      <Card
                        variant="outlined"
                        sx={{
                          p: { xs: 1.5, sm: 2 },
                          borderRadius: '16px',
                          bgcolor: isDark ? 'rgba(15, 23, 42, 0.75)' : '#FFFFFF',
                          opacity: isStale ? 0.8 : 1,
                          borderColor: isStale
                            ? alpha('#EF4444', 0.6)
                            : isOneToOne
                            ? alpha('#10B981', 0.5)
                            : isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(0, 0, 0, 0.08)',
                          boxShadow: isOneToOne
                            ? isDark
                              ? '0 0 20px rgba(16, 185, 129, 0.15)'
                              : '0 4px 20px rgba(16, 185, 129, 0.12)'
                            : 'none',
                          transition: 'border-color 0.2s, box-shadow 0.2s, opacity 0.2s',
                          '@media (prefers-reduced-motion: reduce)': {
                            transition: 'none',
                          },
                          '&:hover': {
                            borderColor: isStale
                              ? '#EF4444'
                              : isOneToOne
                              ? '#10B981'
                              : isDark
                              ? 'rgba(59, 130, 246, 0.4)'
                              : 'rgba(59, 130, 246, 0.3)',
                          },
                        }}
                      >
                        {/* 1. Master Card Header: Symbol, Direction, Lots, SL Protection Status & Financials */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                          {/* Left Identity & Protection Status */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography
                              variant="subtitle1"
                              sx={{
                                fontWeight: 900,
                                letterSpacing: -0.2,
                                fontSize: '1.05rem',
                                cursor: 'pointer',
                                '&:hover': { color: '#3B82F6' },
                              }}
                              onClick={() => navigate(`/trades/${pos.tradeId}`)}
                            >
                              {pos.symbol}
                            </Typography>
                            <Chip
                              label={pos.direction}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                color: isLong ? '#10B981' : '#A855F7',
                                bgcolor: alpha(isLong ? '#10B981' : '#A855F7', 0.12),
                                borderRadius: '4px',
                              }}
                            />
                            {pos.quantity !== undefined && pos.quantity > 0 && (
                              <Chip
                                label={`${pos.quantity} Qty`}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                                  borderRadius: '4px',
                                }}
                              />
                            )}
                            {isStale && (
                              <Tooltip title={`Quote feed is stale (${pos.dataHealth?.tickAgeSeconds}s old). Broker execution guarded.`} arrow>
                                <Chip
                                  label={`⚠️ STALE (${pos.dataHealth?.tickAgeSeconds}s)`}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.62rem',
                                    fontWeight: 800,
                                    bgcolor: alpha('#EF4444', 0.15),
                                    color: '#EF4444',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    borderRadius: '4px',
                                  }}
                                />
                              </Tooltip>
                            )}
                            {isSimulated && !isStale && (
                              <Chip
                                label="SIMULATED"
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '0.6rem',
                                  fontWeight: 800,
                                  bgcolor: alpha('#F59E0B', 0.12),
                                  color: '#F59E0B',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  borderRadius: '4px',
                                }}
                              />
                            )}

                            {/* Streamlined Resting SL / Protection Status */}
                            {pos.isNakedPosition || !pos.hasRestingBrokerSl ? (
                              <Tooltip title="No resting Stop Loss order found on exchange! Click to arm protection." arrow>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="warning"
                                  startIcon={<WarningAmberRoundedIcon sx={{ fontSize: 13 }} />}
                                  onClick={() => {
                                    const slToArm = pos.stopLoss ?? pos.entryPrice;
                                    api.trades
                                      .liveBrokerSl(pos.tradeId, {
                                        stopPrice: slToArm,
                                        executeBroker: true,
                                        idempotencyKey: `${pos.tradeId}_arm_sl_${Date.now()}`,
                                      })
                                      .then(() => {
                                        toast.success(`Protection SL armed on FYERS @ ₹${slToArm}`);
                                        queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
                                      })
                                      .catch((err: any) => {
                                        toast.error(err?.message || 'Failed to place resting SL order');
                                      });
                                  }}
                                  sx={{
                                    height: 20,
                                    px: 0.9,
                                    fontSize: '0.62rem',
                                    fontWeight: 800,
                                    textTransform: 'none',
                                    borderRadius: '4px',
                                    py: 0,
                                  }}
                                >
                                  Arm SL
                                </Button>
                              </Tooltip>
                            ) : (
                              <Tooltip title={`Resting SL order verified on exchange @ ${currSym}${pos.restingSlPrice || pos.stopLoss}`} arrow>
                                <Chip
                                  icon={<CheckCircleRoundedIcon sx={{ fontSize: '11px !important', color: '#10B981' }} />}
                                  label={`SL @ ${currSym}${pos.restingSlPrice || pos.stopLoss}`}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.62rem',
                                    fontWeight: 700,
                                    bgcolor: alpha('#10B981', 0.12),
                                    color: '#10B981',
                                    borderRadius: '4px',
                                  }}
                                />
                              </Tooltip>
                            )}

                            {customRules?.autoExecuteEnabled && (
                              <Tooltip title="Auto-Execution to FYERS Active" arrow>
                                <Chip
                                  label="⚡ AUTO"
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.62rem',
                                    fontWeight: 800,
                                    color: '#10B981',
                                    bgcolor: alpha('#10B981', 0.15),
                                    borderRadius: '4px',
                                  }}
                                />
                              </Tooltip>
                            )}

                            {pos.stagnation?.isStagnant && (
                              <Tooltip
                                title={`${pos.stagnation.message} • In Trade: ${pos.stagnation.minutesOpen}m`}
                                arrow
                              >
                                <Chip
                                  icon={<HourglassEmptyRoundedIcon sx={{ fontSize: '11px !important', color: '#F59E0B' }} />}
                                  label={pos.stagnation.stagnationThreat.replace(/_/g, ' ')}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.62rem',
                                    fontWeight: 800,
                                    color: '#F59E0B',
                                    bgcolor: alpha('#F59E0B', 0.15),
                                    borderRadius: '4px',
                                  }}
                                />
                              </Tooltip>
                            )}
                          </Box>

                          {/* Top-Right Quick Expand / Open Trade Detail Controls */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                            <Tooltip title="Open full trade review" arrow>
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/trades/${pos.tradeId}`)}
                                sx={{ p: 0.35, color: 'text.secondary' }}
                              >
                                <OpenInNewRoundedIcon sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title={isCardCollapsed ? 'Expand Card' : 'Collapse Card'} arrow>
                              <IconButton
                                size="small"
                                onClick={() => handleToggleCardCollapse(pos.tradeId)}
                                sx={{ p: 0.35, color: 'text.secondary' }}
                              >
                                {isCardCollapsed ? <ExpandMoreRoundedIcon sx={{ fontSize: 17 }} /> : <ExpandLessRoundedIcon sx={{ fontSize: 17 }} />}
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>

                        {/* 1B. Responsive Full-Width Live Price, Floating Net MTM & Running Cost Strip */}
                        <Box
                          sx={{
                            mb: 1.5,
                            p: 1.25,
                            borderRadius: '10px',
                            bgcolor: isPosProfitable
                              ? alpha('#10B981', isDark ? 0.08 : 0.05)
                              : alpha('#F43F5E', isDark ? 0.08 : 0.05),
                            border: '1px solid',
                            borderColor: isPosProfitable
                              ? alpha('#10B981', 0.22)
                              : alpha('#F43F5E', 0.22),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 1.5,
                          }}
                        >
                          {/* Left: LTP, Entry Price Delta & Sparkline */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', lineHeight: 1.1 }}>
                                Live LTP · Entry {currSym}{pos.entryPrice}
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 900,
                                    color: pos.priceDeltaPoints >= 0 ? '#10B981' : '#F43F5E',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.25,
                                    fontFamily: `'JetBrains Mono', monospace`,
                                    fontSize: '0.95rem',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {currSym}{pos.currentLtp}
                                  {pos.priceDeltaPoints >= 0 ? (
                                    <TrendingUpRoundedIcon sx={{ fontSize: 15 }} />
                                  ) : (
                                    <TrendingDownRoundedIcon sx={{ fontSize: 15 }} />
                                  )}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontFamily: `'JetBrains Mono', monospace`,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    color: 'text.secondary',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  ({pos.priceDeltaPoints >= 0 ? '+' : ''}{pos.priceDeltaPoints} pts)
                                </Typography>
                              </Box>
                            </Box>

                            {pos.sparkline && (
                              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                                <LiveSparkline points={pos.sparkline} isDark={isDark} width={84} height={24} />
                              </Box>
                            )}
                          </Box>

                          {/* Right: Floating Net MTM, R-Multiple Pill & Running Cost (Fee/Swap) */}
                          <Box sx={{ textAlign: 'right', ml: 'auto', minWidth: 150 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                display: 'block',
                                lineHeight: 1.1,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Floating Net MTM
                            </Typography>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                gap: 0.75,
                                mt: 0.25,
                                flexWrap: 'nowrap',
                              }}
                            >
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 900,
                                  color: posPnLColor,
                                  lineHeight: 1.15,
                                  fontSize: '1.05rem',
                                  fontFamily: `'JetBrains Mono', monospace`,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isPosProfitable ? '+' : ''}
                                {formatCurrency(pos.floatingNetPnL, (pos as any).currency || watcherCurrency)}
                              </Typography>
                              {pos.unrealizedR !== null && (
                                <Chip
                                  label={`${pos.unrealizedR >= 0 ? '+' : ''}${pos.unrealizedR} R`}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.66rem',
                                    fontWeight: 800,
                                    color: posPnLColor,
                                    bgcolor: alpha(posPnLColor, 0.15),
                                    borderRadius: '4px',
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                            </Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontSize: '0.64rem',
                                fontFamily: `'JetBrains Mono', monospace`,
                                display: 'block',
                                mt: 0.2,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Gross: {pos.floatingGrossPnL >= 0 ? '+' : ''}{formatCurrency(pos.floatingGrossPnL, (pos as any).currency || watcherCurrency)} · Cost: -{formatCurrency(pos.estimatedCharges ?? 0, (pos as any).currency || watcherCurrency)}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Next-Action Deterministic Action Hint Strip */}
                        {nextHint && (
                          <Box
                            sx={{
                              mb: 1.5,
                              p: 1.1,
                              borderRadius: '8px',
                              bgcolor:
                                nextHint.severity === 'error'
                                  ? alpha('#EF4444', isDark ? 0.16 : 0.08)
                                  : nextHint.severity === 'warning'
                                  ? alpha('#F59E0B', isDark ? 0.16 : 0.08)
                                  : alpha('#3B82F6', isDark ? 0.16 : 0.08),
                              border: '1px solid',
                              borderColor:
                                nextHint.severity === 'error'
                                  ? alpha('#EF4444', 0.45)
                                  : nextHint.severity === 'warning'
                                  ? alpha('#F59E0B', 0.45)
                                  : alpha('#3B82F6', 0.45),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 1,
                              transition: 'all 0.2s',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 220 }}>
                              <Chip
                                label={nextHint.label}
                                size="small"
                                sx={{
                                  height: 22,
                                  fontSize: '0.65rem',
                                  fontWeight: 900,
                                  bgcolor:
                                    nextHint.severity === 'error'
                                      ? '#EF4444'
                                      : nextHint.severity === 'warning'
                                      ? '#F59E0B'
                                      : '#3B82F6',
                                  color: '#FFFFFF',
                                  borderRadius: '5px',
                                }}
                              />
                              <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 600 }}>
                                {nextHint.description}
                              </Typography>
                            </Box>

                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => handleExecuteHint(pos, nextHint)}
                              sx={{
                                height: 26,
                                px: 1.5,
                                fontSize: '0.68rem',
                                fontWeight: 900,
                                textTransform: 'none',
                                borderRadius: '5px',
                                whiteSpace: 'nowrap',
                                bgcolor:
                                  nextHint.severity === 'error'
                                    ? '#EF4444'
                                    : nextHint.severity === 'warning'
                                    ? '#F59E0B'
                                    : '#3B82F6',
                                color: '#FFFFFF',
                                '&:hover': {
                                  bgcolor:
                                    nextHint.severity === 'error'
                                      ? '#DC2626'
                                      : nextHint.severity === 'warning'
                                      ? '#D97706'
                                      : '#2563EB',
                                },
                              }}
                            >
                              {nextHint.actionText}
                            </Button>
                          </Box>
                        )}

                        {/* 2. Top-Mounted Instant Execution Cockpit Bar */}
                        <Box
                          sx={{
                            mb: 1.5,
                            p: 1,
                            borderRadius: '10px',
                            bgcolor: isOneToOne
                              ? alpha('#10B981', isDark ? 0.12 : 0.06)
                              : isDark
                              ? 'rgba(255, 255, 255, 0.03)'
                              : 'rgba(0, 0, 0, 0.02)',
                            border: '1px solid',
                            borderColor: isOneToOne
                              ? alpha('#10B981', 0.35)
                              : isDark
                              ? 'rgba(255, 255, 255, 0.06)'
                              : 'rgba(0, 0, 0, 0.06)',
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                            {isOneToOne && (
                              <Chip
                                label={`🎯 1:1 MET (+${pos.unrealizedR}R)`}
                                size="small"
                                sx={{
                                  height: 26,
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  bgcolor: '#10B981',
                                  color: '#FFFFFF',
                                  borderRadius: '5px',
                                }}
                              />
                            )}

                            <Tooltip
                              title={
                                pos.dataHealth && !pos.dataHealth.canExecuteBroker
                                  ? `Broker market orders guarded: ${pos.dataHealth.brokerExecutionBlockedReason || 'Simulation / Stale'}. Opens Journal close.`
                                  : 'Book 50% partial profit at current LTP'
                              }
                              arrow
                            >
                              <span>
                                <Button
                                  size="small"
                                  variant="contained"
                                  startIcon={<PieChartRoundedIcon sx={{ fontSize: 13 }} />}
                                  onClick={() => handleOpenQuickClose(pos, 0.5)}
                                  sx={{
                                    height: 26,
                                    px: 1.25,
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    whiteSpace: 'nowrap',
                                    bgcolor: isOneToOne ? '#10B981' : isDark ? '#334155' : '#E2E8F0',
                                    color: isOneToOne ? '#FFFFFF' : isDark ? '#F8FAFC' : '#0F172A',
                                    '&:hover': { bgcolor: isOneToOne ? '#059669' : '#10B981', color: '#FFFFFF' },
                                    borderRadius: '5px',
                                    boxShadow: 'none',
                                  }}
                                >
                                  Book 50%
                                </Button>
                              </span>
                            </Tooltip>

                            <Tooltip
                              title={
                                pos.dataHealth && !pos.dataHealth.canExecuteBroker
                                  ? `Broker market orders guarded: ${pos.dataHealth.brokerExecutionBlockedReason || 'Simulation / Stale'}. Opens Journal close.`
                                  : 'Flatten full 100% position at current LTP'
                              }
                              arrow
                            >
                              <span>
                                <Button
                                  size="small"
                                  variant="contained"
                                  startIcon={<FlashOnRoundedIcon sx={{ fontSize: 13 }} />}
                                  onClick={() => handleOpenQuickClose(pos, 1.0)}
                                  sx={{
                                    height: 26,
                                    px: 1.25,
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    whiteSpace: 'nowrap',
                                    bgcolor: '#EF4444',
                                    color: '#FFFFFF',
                                    '&:hover': { bgcolor: '#DC2626' },
                                    borderRadius: '5px',
                                    boxShadow: 'none',
                                  }}
                                >
                                  Close 100% @ LTP
                                </Button>
                              </span>
                            </Tooltip>

                            <Tooltip
                              title={
                                pos.trueBreakevenPrice
                                  ? `Lock True Breakeven @ ${currSym}${pos.trueBreakevenPrice} (covers all fees: +${pos.feeBufferPoints || 0} pts)`
                                  : `Lock Breakeven @ ${currSym}${pos.entryPrice}`
                              }
                              arrow
                            >
                              <span>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<LockRoundedIcon sx={{ fontSize: 12 }} />}
                                  onClick={() => handleQuickMoveToBe(pos)}
                                  disabled={isAtOrBeyondBe || updateSlMutation.isPending}
                                  sx={{
                                    height: 26,
                                    px: 1.2,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    whiteSpace: 'nowrap',
                                    borderColor: isAtOrBeyondBe ? '#10B981' : '#3B82F6',
                                    color: isAtOrBeyondBe ? '#10B981' : '#3B82F6',
                                    bgcolor: isAtOrBeyondBe ? alpha('#10B981', 0.08) : 'transparent',
                                    '&:hover': { bgcolor: alpha('#3B82F6', 0.1), borderColor: '#2563EB' },
                                    borderRadius: '5px',
                                  }}
                                >
                                  {isAtOrBeyondBe ? 'BE Protected' : `Lock BE+Fees${pos.trueBreakevenPrice ? ` (${currSym}${pos.trueBreakevenPrice.toFixed(1)})` : ''}`}
                                </Button>
                              </span>
                            </Tooltip>

                            <Button
                              size="small"
                              variant={customRules?.autoExecuteEnabled ? 'contained' : 'outlined'}
                              startIcon={<TuneRoundedIcon sx={{ fontSize: 12 }} />}
                              onClick={() => setCustomRulesMetric(pos)}
                              sx={{
                                height: 26,
                                px: 1,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                textTransform: 'none',
                                whiteSpace: 'nowrap',
                                bgcolor: customRules?.autoExecuteEnabled ? '#10B981' : 'transparent',
                                color: customRules?.autoExecuteEnabled ? '#FFFFFF' : 'text.secondary',
                                borderColor: customRules?.autoExecuteEnabled ? '#10B981' : isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                                borderRadius: '5px',
                              }}
                            >
                              {customRules?.autoExecuteEnabled ? '⚡ Auto Armed' : '⚙️ Rules'}
                            </Button>

                            <Button
                              size="small"
                              variant={expandedChartTrades[pos.tradeId] ? 'contained' : 'outlined'}
                              startIcon={<CandlestickChartRoundedIcon sx={{ fontSize: 13 }} />}
                              onClick={() =>
                                setExpandedChartTrades((prev) => ({
                                  ...prev,
                                  [pos.tradeId]: !prev[pos.tradeId],
                                }))
                              }
                              sx={{
                                height: 26,
                                px: 1,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                textTransform: 'none',
                                whiteSpace: 'nowrap',
                                bgcolor: expandedChartTrades[pos.tradeId] ? '#8B5CF6' : 'transparent',
                                color: expandedChartTrades[pos.tradeId] ? '#FFFFFF' : 'text.secondary',
                                borderColor: expandedChartTrades[pos.tradeId]
                                  ? '#8B5CF6'
                                  : isDark
                                  ? 'rgba(255, 255, 255, 0.15)'
                                  : 'rgba(0, 0, 0, 0.15)',
                                borderRadius: '5px',
                                '&:hover': {
                                  bgcolor: expandedChartTrades[pos.tradeId]
                                    ? '#7C3AED'
                                    : alpha('#8B5CF6', 0.12),
                                },
                              }}
                            >
                              {expandedChartTrades[pos.tradeId] ? 'Hide Chart' : 'Live Chart'}
                            </Button>
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<ShieldRoundedIcon sx={{ fontSize: 12 }} />}
                              endIcon={<EditRoundedIcon sx={{ fontSize: 11 }} />}
                              onClick={() => handleOpenEditSl(pos)}
                              sx={{
                                height: 26,
                                px: 1,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                textTransform: 'none',
                                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                                color: isDark ? '#E2E8F0' : '#1E293B',
                                borderRadius: '5px',
                                '&:hover': { borderColor: '#3B82F6', color: '#3B82F6' },
                              }}
                            >
                              SL: {pos.stopLoss !== null ? `${currSym}${pos.stopLoss}` : 'Set'}
                            </Button>
                            <Chip
                              label={threat.label}
                              size="small"
                              sx={{
                                height: 24,
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                color: threat.color,
                                bgcolor: threat.bg,
                                border: `1px solid ${threat.border}`,
                                borderRadius: '4px',
                              }}
                            />
                          </Box>
                        </Box>

                        {/* 2B. Expandable Live Candlestick Chart Drawer Inside Open Position Card */}
                        {expandedChartTrades[pos.tradeId] && (
                          <Box sx={{ mb: 1.5 }}>
                            <LiveMarketChart
                              mode={isPropMode ? 'PROP' : 'NORMAL'}
                              initialSymbol={pos.symbol}
                              lockedSymbol={true}
                              compact={true}
                              height={320}
                              positionOverlay={{
                                tradeId: pos.tradeId,
                                direction: pos.direction,
                                entryPrice: pos.entryPrice,
                                stopLoss: pos.stopLoss,
                                target: pos.target,
                                quantity: pos.quantity,
                                currentLtp: pos.currentLtp,
                              }}
                            />
                          </Box>
                        )}

                        {/* 3. Density-Aware Presentation: Glance Strip vs 2-Column Detailed Inspector */}
                        {isGlance ? (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              px: 1.25,
                              py: 0.8,
                              borderRadius: '8px',
                              bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)',
                              border: `1px solid ${threat.border}`,
                              flexWrap: 'wrap',
                              gap: 1,
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <ShieldRoundedIcon sx={{ fontSize: 14, color: threat.color }} />
                              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                                SL: {currSym}{pos.stopLoss ?? 'None'}
                              </Typography>
                              <Chip
                                label={threat.label}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.6rem',
                                  fontWeight: 800,
                                  bgcolor: threat.bg,
                                  color: threat.color,
                                  borderRadius: '4px',
                                }}
                              />
                            </Box>

                            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.74rem', color: threat.color }}>
                              {pos.distanceToStopPoints !== null
                                ? `${pos.distanceToStopPoints.toFixed(1)} pts away (${pos.distanceToStopTicks ?? 0} ticks)`
                                : 'No stop loss'}
                            </Typography>
                          </Box>
                        ) : (
                          <Collapse in={!isCardCollapsed}>
                            {/* 3. Balanced 2-Column Split: Left Vitals & Radar vs Right Tabbed Inspector */}
                            <Grid container spacing={1.5} sx={{ alignItems: 'stretch' }}>
                              {/* Left Column: Vitals, Price Gauge & Stop Buffer */}
                              <Grid size={{ xs: 12, md: 5.5, lg: 5.5 }}>
                                {ladderViewMode === 'vertical' ? (
                                  <LiveUnifiedPriceLadder
                                    ladder={effectiveLadder}
                                    metric={pos}
                                    onExecuteStep={(step) => setSelectedLadderStep({ step, metric: pos })}
                                    onOpenCustomRules={() => setCustomRulesMetric(pos)}
                                    onQuickTrailSl={(newSl) => {
                                      updateSlMutation.mutate({ tradeId: pos.tradeId, newStopLoss: newSl, executeBroker: true });
                                    }}
                                  />
                                ) : (
                                  <Box
                                    sx={{
                                      p: 1.25,
                                      borderRadius: '10px',
                                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)',
                                      border: '1px solid',
                                      borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                                      height: '100%',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 1,
                                    }}
                                  >
                                    {/* Integrated Live Price Gauge */}
                                    <LivePriceGauge
                                      metric={pos}
                                      onQuickTrailSl={(newSl) => {
                                        updateSlMutation.mutate({ tradeId: pos.tradeId, newStopLoss: newSl, executeBroker: true });
                                      }}
                                    />

                              {/* 2x2 Key Vitals Matrix */}
                              <Grid container spacing={1}>
                                <Grid size={{ xs: 6 }}>
                                  <Box sx={{ p: 0.75, borderRadius: '6px', bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.025)' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                                      Entry Price
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.78rem' }}>
                                      {currSym}{pos.entryPrice}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 700, color: pos.priceDeltaPoints >= 0 ? '#10B981' : '#F43F5E' }}>
                                      {pos.priceDeltaPoints >= 0 ? '+' : ''}{pos.priceDeltaPoints} pts ({pos.priceDeltaPercent >= 0 ? '+' : ''}{pos.priceDeltaPercent}%)
                                    </Typography>
                                  </Box>
                                </Grid>

                                <Grid size={{ xs: 6 }}>
                                  <Box sx={{ p: 0.75, borderRadius: '6px', bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.025)' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                                      Current LTP
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.78rem', color: pos.priceDeltaPoints >= 0 ? '#10B981' : '#F43F5E' }}>
                                      {currSym}{pos.currentLtp}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                                      Gross: {pos.floatingGrossPnL >= 0 ? '+' : ''}{formatCurrency(pos.floatingGrossPnL, (pos as any).currency || watcherCurrency)}
                                    </Typography>
                                  </Box>
                                </Grid>

                                <Grid size={{ xs: 6 }}>
                                  <Box sx={{ p: 0.75, borderRadius: '6px', bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.025)' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                                      Risk Capital (1R)
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.78rem', color: '#F43F5E' }}>
                                      {initialRiskAmount !== null ? formatCurrency(initialRiskAmount, (pos as any).currency || watcherCurrency) : '—'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                                      {initialRiskPts !== null ? `${initialRiskPts.toFixed(1)} pts risk` : 'No stop set'}
                                    </Typography>
                                  </Box>
                                </Grid>

                                <Grid size={{ xs: 6 }}>
                                  <Box sx={{ p: 0.75, borderRadius: '6px', bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.025)' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                                      Position Value
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.78rem' }}>
                                      {formatCurrency(notionalExposure, (pos as any).currency || watcherCurrency)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                                      {multiplier > 1 ? `${pos.quantity ?? 1} lots` : `${pos.quantity ?? 1} units`}
                                    </Typography>
                                  </Box>
                                </Grid>
                              </Grid>

                              {/* Stop Loss Runway Progress */}
                              <Box sx={{ p: 0.75, borderRadius: '6px', border: `1px solid ${threat.border}` }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                                  <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <ShieldRoundedIcon sx={{ fontSize: 12, color: threat.color }} />
                                    SL Runway
                                  </Typography>
                                  <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 800, color: threat.color }}>
                                    {pos.distanceToStopPoints !== null
                                      ? `${pos.distanceToStopPoints > 0 ? `${pos.distanceToStopPoints} pts` : 'Breached'} (${pos.distanceToStopTicks ?? 0} ticks)`
                                      : 'No SL Set'}
                                  </Typography>
                                </Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={stopSafetyPercent ?? (pos.stopLoss !== null ? 100 : 0)}
                                  sx={{
                                    height: 4,
                                    borderRadius: 2,
                                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                                    '& .MuiLinearProgress-bar': { bgcolor: threat.color, borderRadius: 2 },
                                  }}
                                />
                              </Box>

                              {/* Target Runway */}
                              {pos.target !== null ? (
                                <Box sx={{ p: 0.75, borderRadius: '6px', border: '1px solid', borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                                    <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#3B82F6' }}>
                                      Target: {currSym}{pos.target}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.65rem', color: '#3B82F6' }}>
                                      {pos.targetProgressPercent !== null ? `${pos.targetProgressPercent}%` : ''}
                                    </Typography>
                                  </Box>
                                  <LinearProgress
                                    variant="determinate"
                                    value={Math.min(Math.max(pos.targetProgressPercent ?? 0, 0), 100)}
                                    sx={{
                                      height: 4,
                                      borderRadius: 2,
                                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                                      '& .MuiLinearProgress-bar': { bgcolor: '#3B82F6', borderRadius: 2 },
                                    }}
                                  />
                                </Box>
                              ) : nextLadderMilestone ? (
                                <Box sx={{ p: 0.75, borderRadius: '6px', border: '1px solid', borderColor: alpha('#3B82F6', 0.25) }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                                    <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#3B82F6' }}>
                                      Next: {nextLadderMilestone.name} @ {currSym}{nextLadderMilestone.targetPrice}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.65rem', color: '#3B82F6' }}>
                                      {nextLadderMilestone.progressPercent}%
                                    </Typography>
                                  </Box>
                                  <LinearProgress
                                    variant="determinate"
                                    value={Math.min(Math.max(nextLadderMilestone.progressPercent ?? 0, 0), 100)}
                                    sx={{
                                      height: 4,
                                      borderRadius: 2,
                                      bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                                      '& .MuiLinearProgress-bar': { bgcolor: '#3B82F6', borderRadius: 2 },
                                    }}
                                  />
                                </Box>
                              ) : null}

                              {/* Footer Friction Summary */}
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5, mt: 'auto' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
                                  Est. Charges: ~{formatCurrency(pos.estimatedCharges ?? 0, (pos as any).currency || watcherCurrency)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
                                  Contract: {pos.quantity} units
                                </Typography>
                              </Box>
                            </Box>
                          )}
                        </Grid>

                          {/* Right Column: Contextual Tabbed Inspector */}
                          <Grid size={{ xs: 12, md: 6.5, lg: 6.5 }}>
                            <Box
                              sx={{
                                p: 1.25,
                                borderRadius: '10px',
                                bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)',
                                border: '1px solid',
                                borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                              }}
                            >
                              {/* 4-Tab Segmented Selector */}
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25, flexWrap: 'wrap', gap: 0.5 }}>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                  <Chip
                                    label="🪜 LADDER"
                                    size="small"
                                    onClick={() => setTacticalTabs((prev) => ({ ...prev, [pos.tradeId]: 'ladder' }))}
                                    clickable
                                    sx={{
                                      height: 22,
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      bgcolor: activeTacticalTab === 'ladder' ? alpha('#3B82F6', 0.2) : 'transparent',
                                      color: activeTacticalTab === 'ladder' ? '#3B82F6' : 'text.secondary',
                                      border: `1px solid ${activeTacticalTab === 'ladder' ? alpha('#3B82F6', 0.4) : 'transparent'}`,
                                      borderRadius: '5px',
                                    }}
                                  />

                                  <Chip
                                    label={`🛡️ GIVEBACK ${
                                      pos.giveback?.threatLevel === 'CRITICAL_REVERSAL'
                                        ? '🚨'
                                        : pos.giveback?.threatLevel === 'LEAKING'
                                        ? '⚠️'
                                        : ''
                                    }`}
                                    size="small"
                                    onClick={() => setTacticalTabs((prev) => ({ ...prev, [pos.tradeId]: 'giveback' }))}
                                    clickable
                                    sx={{
                                      height: 22,
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      bgcolor: activeTacticalTab === 'giveback'
                                        ? pos.giveback?.threatLevel === 'CRITICAL_REVERSAL'
                                          ? alpha('#EF4444', 0.2)
                                          : pos.giveback?.threatLevel === 'LEAKING'
                                          ? alpha('#F59E0B', 0.2)
                                          : alpha('#10B981', 0.2)
                                        : 'transparent',
                                      color: activeTacticalTab === 'giveback'
                                        ? pos.giveback?.threatLevel === 'CRITICAL_REVERSAL'
                                          ? '#EF4444'
                                          : pos.giveback?.threatLevel === 'LEAKING'
                                          ? '#F59E0B'
                                          : '#10B981'
                                        : 'text.secondary',
                                      border: `1px solid ${
                                        activeTacticalTab === 'giveback'
                                          ? alpha('#3B82F6', 0.4)
                                          : 'transparent'
                                      }`,
                                      borderRadius: '5px',
                                    }}
                                  />

                                  <Chip
                                    label="📊 GREEKS & EDGE"
                                    size="small"
                                    onClick={() => setTacticalTabs((prev) => ({ ...prev, [pos.tradeId]: 'greeks' }))}
                                    clickable
                                    sx={{
                                      height: 22,
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      bgcolor: activeTacticalTab === 'greeks' ? alpha('#8B5CF6', 0.2) : 'transparent',
                                      color: activeTacticalTab === 'greeks' ? '#8B5CF6' : 'text.secondary',
                                      border: `1px solid ${activeTacticalTab === 'greeks' ? alpha('#8B5CF6', 0.4) : 'transparent'}`,
                                      borderRadius: '5px',
                                    }}
                                  />

                                  <Chip
                                    label="🧠 PULSE"
                                    size="small"
                                    onClick={() => setTacticalTabs((prev) => ({ ...prev, [pos.tradeId]: 'pulse' }))}
                                    clickable
                                    sx={{
                                      height: 22,
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      bgcolor: activeTacticalTab === 'pulse' ? alpha('#EC4899', 0.2) : 'transparent',
                                      color: activeTacticalTab === 'pulse' ? '#EC4899' : 'text.secondary',
                                      border: `1px solid ${activeTacticalTab === 'pulse' ? alpha('#EC4899', 0.4) : 'transparent'}`,
                                      borderRadius: '5px',
                                    }}
                                  />
                                </Box>

                                {activeTacticalTab === 'ladder' && (effectiveLadder || pos.targetLadder) && (
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
                                    1R = {(effectiveLadder || pos.targetLadder)!.initialRiskPoints.toFixed(1)} pts
                                  </Typography>
                                )}
                              </Box>

                              {/* Tab Content Display */}
                              <Box sx={{ flex: 1 }}>
                                {activeTacticalTab === 'ladder' && (effectiveLadder || pos.targetLadder) ? (
                                  <LiveScalingLadder
                                    ladder={effectiveLadder || pos.targetLadder!}
                                    metric={{ ...pos, lotSize: effectiveLotSize }}
                                    compact
                                    onExecuteStep={(step) => setSelectedLadderStep({ step, metric: pos })}
                                    onOpenCustomRules={() => setCustomRulesMetric(pos)}
                                  />
                                ) : activeTacticalTab === 'giveback' && pos.giveback ? (
                                  <LiveGivebackMeter
                                    giveback={pos.giveback}
                                    metric={pos}
                                    compact
                                    onLockProfit={() => handleOpenQuickClose(pos, 0.5)}
                                  />
                                ) : activeTacticalTab === 'greeks' ? (
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {pos.optionsGreeks && (
                                      <LiveOptionsGreeksCard greeks={pos.optionsGreeks} isDark={isDark} />
                                    )}
                                    {pos.setupEdgeStats ? (
                                      <Box
                                        sx={{
                                          p: 1,
                                          borderRadius: '8px',
                                          bgcolor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.05)',
                                          border: '1px solid',
                                          borderColor: alpha('#3B82F6', 0.2),
                                        }}
                                      >
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                          <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.7rem', color: '#3B82F6' }}>
                                            {typeof pos.setupEdgeStats.setupName === 'string'
                                              ? pos.setupEdgeStats.setupName
                                              : 'Setup Edge Intelligence'}
                                          </Typography>
                                          <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
                                            Win Rate: <strong style={{ color: '#10B981' }}>{pos.setupEdgeStats.winRate}%</strong> ({pos.setupEdgeStats.totalSampleTrades} trades)
                                          </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.65rem', color: 'text.secondary' }}>
                                          <span>Expectancy: <strong style={{ color: pos.setupEdgeStats.expectancyR >= 0 ? '#10B981' : '#F43F5E' }}>{pos.setupEdgeStats.expectancyR > 0 ? '+' : ''}{pos.setupEdgeStats.expectancyR}R</strong></span>
                                          <span>Avg MFE: <strong style={{ color: '#10B981' }}>+{pos.setupEdgeStats.avgMfeR}R</strong></span>
                                          <span>Avg MAE: <strong style={{ color: '#F43F5E' }}>-{pos.setupEdgeStats.avgMaeR}R</strong></span>
                                        </Box>
                                      </Box>
                                    ) : !pos.optionsGreeks ? (
                                      <Box sx={{ py: 3, textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">
                                          Historical setup intelligence or options greeks will populate for this contract.
                                        </Typography>
                                      </Box>
                                    ) : null}
                                  </Box>
                                ) : activeTacticalTab === 'pulse' ? (
                                  <Box sx={{ p: 1 }}>
                                    <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                                      Select your current emotional state during this trade:
                                    </Typography>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
                                      {[
                                        { emotion: 'CALM', label: '😌 Calm & Focused', color: '#10B981' },
                                        { emotion: 'FOMO', label: '⚡ FOMO Entered', color: '#F59E0B' },
                                        { emotion: 'HESITANT', label: '⏳ Hesitant', color: '#6366F1' },
                                        { emotion: 'GREEDY', label: '💰 Greedy / Overconfident', color: '#EC4899' },
                                        { emotion: 'ANXIOUS', label: '🚨 Anxious / Stressed', color: '#EF4444' },
                                      ].map((item) => (
                                        <Button
                                          key={item.emotion}
                                          size="small"
                                          onClick={() => handleRecordPulse(pos.tradeId, item.emotion)}
                                          sx={{
                                            py: 0.75,
                                            px: 1,
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            borderRadius: '6px',
                                            textTransform: 'none',
                                            bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                                            color: 'text.primary',
                                            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                                            '&:hover': {
                                              bgcolor: alpha(item.color, 0.15),
                                              color: item.color,
                                              borderColor: item.color,
                                            },
                                          }}
                                        >
                                          {item.label}
                                        </Button>
                                      ))}
                                    </Box>
                                  </Box>
                                ) : (
                                  <Box sx={{ py: 3, textAlign: 'center' }}>
                                    <Typography variant="caption" color="text.secondary">
                                      Set Stop Loss & Target in trade details to activate automated scaling ladder.
                                    </Typography>
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          </Grid>
                        </Grid>
                      </Collapse>
                    )}
                  </Card>
                </Grid>
                  );
                })}
              </Grid>
            )}
          </>
        )}
          </Box>
        </Collapse>
      </Card>

      {/* Move / Adjust Stop Loss Dialog */}
      {editSlMetric && (
        <Dialog
          open={Boolean(editSlMetric)}
          onClose={() => setEditSlMetric(null)}
          maxWidth="xs"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                borderRadius: '16px',
                bgcolor: isDark ? '#0F172A' : '#FFFFFF',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              },
            },
          }}
        >
          <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShieldRoundedIcon sx={{ color: '#3B82F6', fontSize: 22 }} />
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
                Adjust Stop Loss
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setEditSlMetric(null)}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 1 }}>
            {/* Symbol & Direction context */}
            <Box
              sx={{
                p: 1.5,
                mb: 2,
                borderRadius: '10px',
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                  Instrument
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  {editSlMetric.symbol}
                </Typography>
              </Box>

              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                  Entry Price
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {currSym}{editSlMetric.entryPrice}
                </Typography>
              </Box>

              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                  Current LTP
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, color: '#3B82F6' }}>
                  {currSym}{editSlMetric.currentLtp}
                </Typography>
              </Box>
            </Box>

            {/* Quick Presets */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75, fontWeight: 700, fontSize: '0.7rem' }}>
              Quick Presets
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
              {editSlMetric.trueBreakevenPrice && (
                <Chip
                  label={`True BE (${currSym}${editSlMetric.trueBreakevenPrice}) [Fees Protected]`}
                  size="small"
                  onClick={() => setTargetSlPrice(String(editSlMetric.trueBreakevenPrice))}
                  clickable
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    bgcolor: targetSlPrice === String(editSlMetric.trueBreakevenPrice) ? alpha('#10B981', 0.25) : alpha('#10B981', 0.08),
                    color: '#10B981',
                    borderColor: '#10B981',
                  }}
                />
              )}
              <Chip
                label={`Nominal BE (${currSym}${editSlMetric.entryPrice})`}
                size="small"
                onClick={() => setTargetSlPrice(String(editSlMetric.entryPrice))}
                clickable
                sx={{
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  bgcolor: targetSlPrice === String(editSlMetric.entryPrice) ? alpha('#3B82F6', 0.25) : alpha('#3B82F6', 0.08),
                  color: '#3B82F6',
                  borderColor: '#3B82F6',
                }}
              />
              {editSlMetric.direction === 'LONG' && editSlMetric.currentLtp > editSlMetric.entryPrice && (
                <Chip
                  label={`Trail 5 pts below LTP (${currSym}${Number((editSlMetric.currentLtp - 5).toFixed(2))})`}
                  size="small"
                  onClick={() => setTargetSlPrice(String(Number((editSlMetric.currentLtp - 5).toFixed(2))))}
                  clickable
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    bgcolor: alpha('#10B981', 0.08),
                    color: '#10B981',
                  }}
                />
              )}
              {editSlMetric.direction === 'SHORT' && editSlMetric.currentLtp < editSlMetric.entryPrice && (
                <Chip
                  label={`Trail 5 pts above LTP (${currSym}${Number((editSlMetric.currentLtp + 5).toFixed(2))})`}
                  size="small"
                  onClick={() => setTargetSlPrice(String(Number((editSlMetric.currentLtp + 5).toFixed(2))))}
                  clickable
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    bgcolor: alpha('#10B981', 0.08),
                    color: '#10B981',
                  }}
                />
              )}
            </Box>

            {/* Price Input */}
            <TextField
              label="Stop Loss Price"
              type="number"
              fullWidth
              autoFocus
              value={targetSlPrice}
              onChange={(e) => setTargetSlPrice(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">{currSym}</InputAdornment>,
                  inputProps: { step: 'any' },
                },
              }}
              helperText={`Current SL: ${editSlMetric.stopLoss !== null ? `${currSym}${editSlMetric.stopLoss}` : 'Not set'}`}
              sx={{ mb: 1.5 }}
            />

            {/* Live Broker Execution Indicator & Toggle */}
            <Box
              sx={{
                mb: 2,
                p: 1.25,
                borderRadius: '8px',
                bgcolor: executeSlOnBroker ? alpha('#10B981', 0.1) : alpha('#64748B', 0.1),
                border: '1px solid',
                borderColor: executeSlOnBroker ? alpha('#10B981', 0.3) : alpha('#64748B', 0.2),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: executeSlOnBroker ? '#10B981' : '#64748B',
                    boxShadow: executeSlOnBroker ? '0 0 8px #10B981' : 'none',
                  }}
                />
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', color: executeSlOnBroker ? '#10B981' : 'text.secondary' }}>
                    Live Broker Execution (FYERS API v3)
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                    {executeSlOnBroker
                      ? 'Order will be placed/modified directly in FYERS orderbook'
                      : 'Update SetupMint journal only'}
                  </Typography>
                </Box>
              </Box>
              <Switch
                size="small"
                checked={executeSlOnBroker}
                onChange={(e) => setExecuteSlOnBroker(e.target.checked)}
                color="success"
              />
            </Box>

            {/* Dynamic Analysis / Risk Impact Message */}
            {(() => {
              const numSl = Number(targetSlPrice);
              if (!targetSlPrice || isNaN(numSl) || numSl <= 0) return null;
              const isLong = editSlMetric.direction === 'LONG';
              const isImmediateTrigger = isLong ? numSl >= editSlMetric.currentLtp : numSl <= editSlMetric.currentLtp;
              const isBe = numSl === editSlMetric.entryPrice;
              const isProfitLock = isLong ? numSl > editSlMetric.entryPrice : numSl < editSlMetric.entryPrice;
              const riskPerUnit = Math.abs(editSlMetric.entryPrice - numSl);
              const totalRiskAmount = riskPerUnit * (editSlMetric.quantity || 1) * (editSlMetric.contractMultiplier || 1);

              if (isImmediateTrigger) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#EF4444', 0.12), border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 700, display: 'block' }}>
                      ⚠️ Warning: SL is {isLong ? 'at or above' : 'at or below'} current LTP ({currSym}{editSlMetric.currentLtp}). Order will trigger instantly!
                    </Typography>
                  </Box>
                );
              }

              const isTrueBe = editSlMetric.trueBreakevenPrice && numSl === editSlMetric.trueBreakevenPrice;
              if (isTrueBe) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#10B981', 0.12), border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 700, display: 'block' }}>
                      🛡️ True Breakeven: Capital & Fees Protected (covers {currSym}{(editSlMetric.feeBufferPoints || 0).toFixed(2)} pts brokerage & govt taxes)
                    </Typography>
                  </Box>
                );
              }

              if (isProfitLock) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#10B981', 0.12), border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 700, display: 'block' }}>
                      🔒 Profit Protected: Locks in +{currSym}{riskPerUnit.toFixed(2)} / unit (~{formatCurrency(totalRiskAmount, watcherCurrency)})
                    </Typography>
                  </Box>
                );
              }

              if (isBe) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#3B82F6', 0.12), border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#3B82F6', fontWeight: 700, display: 'block' }}>
                      🛡️ Breakeven: Capital Protected ({currSym}0 loss if stopped out)
                    </Typography>
                  </Box>
                );
              }

              return (
                <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#F59E0B', 0.12), border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <Typography variant="caption" sx={{ color: '#F59E0B', fontWeight: 700, display: 'block' }}>
                    🔻 Downside Risk: -{currSym}{riskPerUnit.toFixed(2)} / unit (~{formatCurrency(totalRiskAmount, watcherCurrency)})
                  </Typography>
                </Box>
              );
            })()}
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditSlMetric(null)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={
                !targetSlPrice ||
                isNaN(Number(targetSlPrice)) ||
                Number(targetSlPrice) <= 0 ||
                updateSlMutation.isPending
              }
              onClick={() => {
                if (editSlMetric && targetSlPrice) {
                  updateSlMutation.mutate({
                    tradeId: editSlMetric.tradeId,
                    newStopLoss: Number(targetSlPrice),
                    executeBroker: executeSlOnBroker,
                  });
                }
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: '8px',
                bgcolor: executeSlOnBroker ? '#10B981' : '#3B82F6',
                '&:hover': { bgcolor: executeSlOnBroker ? '#059669' : '#2563EB' },
              }}
            >
              {updateSlMutation.isPending
                ? 'Transmitting Order...'
                : executeSlOnBroker
                ? '⚡ Execute Live Broker SL'
                : 'Update Stop Loss'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Quick Close Trade Modal with Pre-filled LTP and Ratio */}
      {quickCloseTrade && (
        <QuickCloseTradeDialog
          open={Boolean(quickCloseTrade)}
          onClose={() => {
            setQuickCloseTrade(null);
            setQuickCloseLtp(undefined);
          }}
          trade={quickCloseTrade}
          defaultExitPrice={quickCloseLtp}
          defaultCloseRatio={quickCloseRatio}
          dataHealth={quickCloseTrade?.dataHealth || summary?.dataHealth}
          onSuccess={(closedTradeData?: any) => {
            queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
            queryClient.invalidateQueries({ queryKey: ['trades'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            if (onTradeCloseSuccess) onTradeCloseSuccess();
            if (closedTradeData) {
              setRecapTrade(closedTradeData);
            }
          }}
        />
      )}

      {/* Execute Multi-Target Ladder Step Dialog */}
      {selectedLadderStep && (
        <ExecuteLadderStepDialog
          open={Boolean(selectedLadderStep)}
          onClose={() => setSelectedLadderStep(null)}
          isLoading={executeLadderMutation.isPending}
          step={selectedLadderStep.step}
          metric={selectedLadderStep.metric}
          dataHealth={selectedLadderStep.metric?.dataHealth || summary?.dataHealth}
          onConfirm={(payload) => {
            executeLadderMutation.mutate({
              tradeId: selectedLadderStep.metric.tradeId,
              targetIndex: payload.targetIndex,
              label: payload.label,
              exitQty: payload.exitQty,
              exitPrice: selectedLadderStep.metric.currentLtp,
              newStopLoss: payload.newStopLoss,
              executeBroker: payload.executeBroker,
            });
          }}
        />
      )}

      {/* Custom Scaling Ladder Rules & Auto-Execution Dialog */}
      {customRulesMetric && (
        <LiveCustomRulesDialog
          open={Boolean(customRulesMetric)}
          onClose={() => setCustomRulesMetric(null)}
          metric={customRulesMetric}
          defaultSettings={user?.liveWatcherSettings}
          onSave={(rules) => {
            handleSaveTradeRules(customRulesMetric.tradeId, rules);
            setCustomRulesMetric(null);
          }}
        />
      )}

      {/* 🚨 Emergency Panic Kill Switch Dialog */}
      {killSwitchOpen && (
        <PanicKillSwitchDialog
          open={killSwitchOpen}
          onClose={() => setKillSwitchOpen(false)}
          summary={summary ?? null}
          onCompleted={() => {
            setKillSwitchOpen(false);
            queryClient.invalidateQueries({ queryKey: ['live-open-trades-watcher'] });
            queryClient.invalidateQueries({ queryKey: ['trades'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            if (onTradeCloseSuccess) onTradeCloseSuccess();
          }}
        />
      )}

      {/* 🏁 Instant Post-Trade Flight Recorder & Trade Receipt Dialog */}
      {recapTrade && (
        <TradeFlightRecorderDialog
          open={Boolean(recapTrade)}
          onClose={() => setRecapTrade(null)}
          trade={recapTrade}
        />
      )}

      {/* 💾 Save Custom Layout Preset Dialog */}
      <Dialog
        open={savePresetDialogOpen}
        onClose={() => setSavePresetDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: { borderRadius: 2.5, p: 1 },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: '1rem', pb: 1 }}>
          Save Custom Layout Preset
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 2 }}>
            Save your current view configuration (Density: <b>{cardDensity.toUpperCase()}</b>, Refresh: <b>{refreshIntervalSec}s</b>, Tactical: <b>{ladderViewMode.toUpperCase()}</b>, Hotkeys: <b>{scalperHotkeysEnabled ? 'ON' : 'OFF'}</b>) as a quick-switch layout.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Preset Name"
            placeholder="e.g. F&O Fast Scalper"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveCustomPreset();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSavePresetDialogOpen(false)} size="small" sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveCustomPreset}
            variant="contained"
            size="small"
            disabled={!newPresetName.trim()}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Save Preset
          </Button>
        </DialogActions>
      </Dialog>

      {/* 🔔 In-App Threat Alert Center Dialog */}
      <LiveAlertCenterDialog
        open={alertCenterOpen}
        onClose={() => setAlertCenterOpen(false)}
      />

      {/* ⌨️ Hotkeys Cheat Sheet Overlay */}
      <HotkeyCheatSheetDialog
        open={cheatSheetOpen}
        onClose={() => setCheatSheetOpen(false)}
      />

      {/* 🪟 Document Picture-in-Picture Mini Watcher Companion */}
      {isPipActive && pipWindow && createPortal(
        <Box sx={{ p: 2, bgcolor: '#0b0f19', color: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, pb: 1, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#f8fafc', fontSize: '0.85rem' }}>
                SetupMint Live Mini
              </Typography>
              <Chip
                label={`${openTradesCount} Pos`}
                size="small"
                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 800, bgcolor: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
              />
            </Box>
            <Typography
              variant="caption"
              sx={{
                fontFamily: 'monospace',
                fontWeight: 800,
                fontSize: '0.85rem',
                fontVariantNumeric: 'tabular-nums',
                color: (summary?.totalFloatingNetPnL ?? 0) >= 0 ? '#10b981' : '#ef4444',
              }}
            >
              {(summary?.totalFloatingNetPnL ?? 0) >= 0 ? '+' : ''}
              {formatCurrency(summary?.totalFloatingNetPnL ?? 0)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {sortedPositions.map((pos) => {
              const isLong = pos.direction === 'LONG';
              const pnl = pos.floatingNetPnL;
              const pnlColor = pnl >= 0 ? '#10b981' : '#ef4444';
              const hint = pos.nextActionHint ?? selectNextActionHint(pos);

              return (
                <Card
                  key={pos.tradeId}
                  sx={{
                    p: 1.25,
                    bgcolor: 'rgba(30, 41, 59, 0.75)',
                    border: '1px solid',
                    borderColor:
                      pos.stopThreatLevel === 'CRITICAL' || pos.stopThreatLevel === 'BREACHED'
                        ? 'rgba(239, 68, 68, 0.6)'
                        : 'rgba(255, 255, 255, 0.08)',
                    borderRadius: 1.5,
                    color: '#ffffff',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.85rem', color: '#ffffff' }}>
                        {pos.symbol}
                      </Typography>
                      <Chip
                        label={pos.direction}
                        size="small"
                        sx={{
                          height: 16,
                          fontSize: '0.6rem',
                          fontWeight: 800,
                          bgcolor: isLong ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: isLong ? '#10b981' : '#ef4444',
                        }}
                      />
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        color: pnlColor,
                        fontSize: '0.85rem',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.75 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem' }}>
                      LTP ₹{pos.currentLtp.toFixed(2)} · {pos.unrealizedR !== null ? `${pos.unrealizedR >= 0 ? '+' : ''}${pos.unrealizedR.toFixed(2)}R` : '—'}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: 'monospace',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color:
                          pos.stopThreatLevel === 'CRITICAL' || pos.stopThreatLevel === 'BREACHED'
                            ? '#ef4444'
                            : 'rgba(255,255,255,0.7)',
                      }}
                    >
                      SL: ₹{pos.stopLoss !== null ? pos.stopLoss.toFixed(2) : 'None'} ({pos.distanceToStopPoints !== null ? `${pos.distanceToStopPoints.toFixed(1)} pts` : '—'})
                    </Typography>
                  </Box>

                  {hint && (
                    <Box sx={{ mt: 0.75 }}>
                      <Button
                        size="small"
                        fullWidth
                        variant="outlined"
                        onClick={() => {
                          handleExecuteHint(pos, hint);
                          window.focus();
                        }}
                        sx={{
                          height: 22,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          textTransform: 'none',
                          borderColor: hint.severity === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.5)',
                          color: hint.severity === 'error' ? '#ef4444' : '#60a5fa',
                          bgcolor: hint.severity === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.08)',
                        }}
                      >
                        ⚡ {hint.actionText}
                      </Button>
                    </Box>
                  )}
                </Card>
              );
            })}
          </Box>
        </Box>,
        pipWindow.document.body
      )}

      {/* ♿ Accessibility Screen-Reader Live Regions */}
      <div className="sr-only" aria-live="assertive" role="alert">
        {assertiveAnnouncement}
      </div>
      <div className="sr-only" aria-live="polite">
        {politeAnnouncement}
      </div>
    </>
  );
}
