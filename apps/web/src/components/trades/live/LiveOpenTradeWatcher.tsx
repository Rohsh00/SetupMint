import React, { useState, useEffect, useRef } from 'react';
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

import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import NotificationsOffRoundedIcon from '@mui/icons-material/NotificationsOffRounded';
import DangerousRoundedIcon from '@mui/icons-material/DangerousRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import KeyboardAltRoundedIcon from '@mui/icons-material/KeyboardAltRounded';

import { LiveGivebackMeter } from './LiveGivebackMeter.js';
import { LiveScalingLadder } from './LiveScalingLadder.js';
import { ExecuteLadderStepDialog } from './ExecuteLadderStepDialog.js';
import { LiveCustomRulesDialog } from './LiveCustomRulesDialog.js';
import { LivePriceGauge } from './LivePriceGauge.js';
import { LiveSparkline } from './LiveSparkline.js';
import { LiveOptionsGreeksCard } from './LiveOptionsGreeksCard.js';
import { LivePortfolioRiskBanner } from './LivePortfolioRiskBanner.js';
import { PanicKillSwitchDialog } from './PanicKillSwitchDialog.js';
import { soundEngine } from '../../../lib/sound-engine.js';
import { notificationService } from '../../../lib/notification-service.js';
import { useAuth } from '../../../context/AuthContext.js';
import {
  ILiveWatcherSummary,
  ILiveOpenTradeMetric,
  ILiveTargetLadderStep,
  ICustomLadderRules,
  StopThreatLevel,
  createLadderRulesFromSettings,
} from '@tradevault/shared';
import {
  calculateTargetLadder,
  calculateDynamicTrailingStop,
  evaluateGivebackAutoExit,
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
    updateSlMutation.mutate({
      tradeId: metric.tradeId,
      newStopLoss: bePrice,
      executeBroker: true,
    });
  };

  // Master 1-Click Action: De-Risk All open positions to True Breakeven with fee cushion
  const handleDeRiskAllPositions = async () => {
    if (!summary?.positions || summary.positions.length === 0) return;
    setIsDeRiskingAll(true);
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
          executeBroker: true,
          idempotencyKey: `${pos.tradeId}_derisk_all_${Date.now()}`,
        });
        securedCount++;
      }

      soundEngine.playTargetHit();
      if (securedCount > 0) {
        toast.success(
          `🛡️ De-Risk Complete: Secured ${securedCount} position${securedCount > 1 ? 's' : ''} to True Breakeven (+fees protected)!`
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

  const handleSaveTradeRules = (tradeId: string, rules: ICustomLadderRules) => {
    setTradeRulesMap((prev) => {
      const next = { ...prev, [tradeId]: rules };
      localStorage.setItem('tv_trade_custom_rules_map', JSON.stringify(next));
      return next;
    });
    toast.success(
      `Saved custom ladder rules${rules.autoExecuteEnabled ? ' (⚡ Auto-Execution to FYERS Armed)' : ''}!`
    );
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
    queryKey: ['live-open-trades-watcher', accountId],
    queryFn: () => api.trades.getLiveWatcher(accountId),
    refetchInterval: refreshIntervalSec > 0 ? refreshIntervalSec * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Global Scalper Keyboard Hotkeys Listener
  useEffect(() => {
    if (!scalperHotkeysEnabled || !summary?.positions?.length) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

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
  }, [scalperHotkeysEnabled, summary?.positions]);

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

  const getProviderBadge = (provider?: string) => {
    switch (provider) {
      case 'FYERS':
        return {
          label: 'FYERS LIVE',
          color: '#10B981',
          bg: alpha('#10B981', 0.12),
          tooltip: 'Real-time quotes fetched live from your FYERS API session',
        };
      case 'ANGEL_ONE':
        return {
          label: 'ANGEL ONE LIVE',
          color: '#0EA5E9',
          bg: alpha('#0EA5E9', 0.12),
          tooltip: 'Real-time quotes fetched live from Angel One SmartAPI',
        };
      case 'SIMULATED':
      default:
        return {
          label: 'SIMULATED TICK',
          color: '#F59E0B',
          bg: alpha('#F59E0B', 0.12),
          tooltip: 'Market closed or broker session not active. Displaying realistic simulated ticks for demonstration.',
        };
    }
  };

  const providerBadge = getProviderBadge(summary?.provider);

  const handleOpenQuickClose = async (metric: ILiveOpenTradeMetric, ratio: number = 1.0) => {
    setQuickCloseRatio(ratio);
    try {
      const fullTrade = await api.trades.get(metric.tradeId);
      setQuickCloseTrade(fullTrade);
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

            {/* Consolidated Modern Status Badge */}
            <Tooltip
              title={
                <Box sx={{ p: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, display: 'block' }}>
                    {providerBadge.label} ({providerBadge.tooltip})
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                    • Active Positions: {openTradesCount}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                    • Telegram Alerts: {user?.liveWatcherSettings?.telegramAlertsEnabled ? 'ARMED' : 'OFF'}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                    • Server Runner: {user?.liveWatcherSettings?.serverSideExecutionEnabled ? 'ACTIVE 24/7' : 'OFF'}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                    • Mode: {user?.liveWatcherSettings?.paperExecutionMode ? 'PAPER SIMULATION' : 'BROKER LIVE'}
                  </Typography>
                </Box>
              }
              arrow
            >
              <Chip
                label={`${summary?.provider === 'FYERS' ? '🟢 FYERS LIVE' : '⚪ SIMULATION'} · ${openTradesCount} ACTIVE`}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  color: providerBadge.color,
                  bgcolor: providerBadge.bg,
                  border: `1px solid ${alpha(providerBadge.color, 0.3)}`,
                  borderRadius: '6px',
                }}
              />
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
                    {formatCurrency(summary?.totalFloatingNetPnL ?? 0, 'INR')}
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
              <Tooltip title="🚨 Panic Kill Switch: Instantly market-close all positions on FYERS and cancel all resting stop loss orders" arrow>
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
                  KILL SWITCH
                </Button>
              </Tooltip>
            )}

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

        {/* Collapsible Open Trade Cards Grid */}
        <Collapse in={expanded}>
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
                    <LivePortfolioRiskBanner risk={summary.portfolioRisk} isDark={isDark} />
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
                    {summary?.positions.map((pos) => {
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
                            bgcolor: isOneToOne
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
                                    ₹{pos.currentLtp}
                                  </Typography>
                                  {pos.priceDeltaPoints >= 0 ? (
                                    <TrendingUpRoundedIcon sx={{ fontSize: 14, color: '#10B981' }} />
                                  ) : (
                                    <TrendingDownRoundedIcon sx={{ fontSize: 14, color: '#F43F5E' }} />
                                  )}
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                  Entry: ₹{pos.entryPrice} ({pos.priceDeltaPoints >= 0 ? '+' : ''}{pos.priceDeltaPoints} pts)
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
                              {formatCurrency(pos.floatingNetPnL, 'INR')}
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
                {summary?.positions.map((pos) => {
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

                  return (
                    <Grid size={{ xs: 12, lg: openTradesCount === 1 ? 12 : 6 }} key={pos.tradeId}>
                      <Card
                        variant="outlined"
                        sx={{
                          p: { xs: 1.5, sm: 2 },
                          borderRadius: '16px',
                          bgcolor: isDark ? 'rgba(15, 23, 42, 0.75)' : '#FFFFFF',
                          borderColor: isOneToOne
                            ? alpha('#10B981', 0.5)
                            : isDark
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(0, 0, 0, 0.08)',
                          boxShadow: isOneToOne
                            ? isDark
                              ? '0 0 20px rgba(16, 185, 129, 0.15)'
                              : '0 4px 20px rgba(16, 185, 129, 0.12)'
                            : 'none',
                          transition: 'border-color 0.2s, box-shadow 0.2s',
                          '&:hover': {
                            borderColor: isOneToOne
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
                                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
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
                              <Tooltip title={`Resting SL order verified on exchange @ ₹${pos.restingSlPrice || pos.stopLoss}`} arrow>
                                <Chip
                                  icon={<CheckCircleRoundedIcon sx={{ fontSize: '11px !important', color: '#10B981' }} />}
                                  label={`SL @ ₹${pos.restingSlPrice || pos.stopLoss}`}
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

                            <Tooltip title="Open full trade review" arrow>
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/trades/${pos.tradeId}`)}
                                sx={{ p: 0.25, color: 'text.secondary' }}
                              >
                                <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>

                          {/* Right: Sparkline, Monospace LTP & Floating MTM */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            {pos.sparkline && (
                              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                                <LiveSparkline points={pos.sparkline} isDark={isDark} width={110} height={24} />
                              </Box>
                            )}
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', display: 'block', lineHeight: 1 }}>
                                LTP
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 800,
                                  color: pos.priceDeltaPoints >= 0 ? '#10B981' : '#F43F5E',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.25,
                                  fontFamily: 'monospace',
                                  fontSize: '0.85rem',
                                }}
                              >
                                ₹{pos.currentLtp}
                                {pos.priceDeltaPoints >= 0 ? (
                                  <TrendingUpRoundedIcon sx={{ fontSize: 14 }} />
                                ) : (
                                  <TrendingDownRoundedIcon sx={{ fontSize: 14 }} />
                                )}
                              </Typography>
                            </Box>

                            <Box sx={{ textAlign: 'right' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', display: 'block', lineHeight: 1 }}>
                                Floating Net MTM
                              </Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: posPnLColor, lineHeight: 1.1, fontSize: '0.95rem' }}>
                                  {isPosProfitable ? '+' : ''}
                                  {formatCurrency(pos.floatingNetPnL, 'INR')}
                                </Typography>
                                {pos.unrealizedR !== null && (
                                  <Chip
                                    label={`${pos.unrealizedR >= 0 ? '+' : ''}${pos.unrealizedR} R`}
                                    size="small"
                                    sx={{
                                      height: 20,
                                      fontSize: '0.65rem',
                                      fontWeight: 800,
                                      color: posPnLColor,
                                      bgcolor: alpha(posPnLColor, 0.12),
                                      borderRadius: '4px',
                                    }}
                                  />
                                )}
                              </Box>
                            </Box>
                          </Box>
                        </Box>

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
                                  {isAtOrBeyondBe ? 'BE Protected' : `Lock BE+Fees${pos.trueBreakevenPrice ? ` (₹${pos.trueBreakevenPrice.toFixed(1)})` : ''}`}
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
                              SL: {pos.stopLoss !== null ? `₹${pos.stopLoss}` : 'Set'}
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

                        {/* 3. Balanced 2-Column Split: Left Vitals & Radar vs Right Tabbed Inspector */}
                        <Grid container spacing={1.5} sx={{ alignItems: 'stretch' }}>
                          {/* Left Column: Vitals, Price Gauge & Stop Buffer */}
                          <Grid size={{ xs: 12, md: 5.5, lg: 5.5 }}>
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
                                      ₹{pos.entryPrice}
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
                                      ₹{pos.currentLtp}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                                      Gross: {pos.floatingGrossPnL >= 0 ? '+' : ''}{formatCurrency(pos.floatingGrossPnL, 'INR')}
                                    </Typography>
                                  </Box>
                                </Grid>

                                <Grid size={{ xs: 6 }}>
                                  <Box sx={{ p: 0.75, borderRadius: '6px', bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.025)' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                                      Risk Capital (1R)
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '0.78rem', color: '#F43F5E' }}>
                                      {initialRiskAmount !== null ? formatCurrency(initialRiskAmount, 'INR') : '—'}
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
                                      {formatCurrency(notionalExposure, 'INR')}
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
                                      Target: ₹{pos.target}
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
                                      Next: {nextLadderMilestone.name} @ ₹{nextLadderMilestone.targetPrice}
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
                                  Est. Charges: ~{formatCurrency(pos.estimatedCharges ?? 0, 'INR')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
                                  Contract: {pos.quantity} units
                                </Typography>
                              </Box>
                            </Box>
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
                  ₹{editSlMetric.entryPrice}
                </Typography>
              </Box>

              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem' }}>
                  Current LTP
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, color: '#3B82F6' }}>
                  ₹{editSlMetric.currentLtp}
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
                  label={`True BE (₹${editSlMetric.trueBreakevenPrice}) [Fees Protected]`}
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
                label={`Nominal BE (₹${editSlMetric.entryPrice})`}
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
                  label={`Trail 5 pts below LTP (₹${Number((editSlMetric.currentLtp - 5).toFixed(2))})`}
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
                  label={`Trail 5 pts above LTP (₹${Number((editSlMetric.currentLtp + 5).toFixed(2))})`}
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
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  inputProps: { step: 'any' },
                },
              }}
              helperText={`Current SL: ${editSlMetric.stopLoss !== null ? `₹${editSlMetric.stopLoss}` : 'Not set'}`}
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
                      ⚠️ Warning: SL is {isLong ? 'at or above' : 'at or below'} current LTP (₹{editSlMetric.currentLtp}). Order will trigger instantly!
                    </Typography>
                  </Box>
                );
              }

              const isTrueBe = editSlMetric.trueBreakevenPrice && numSl === editSlMetric.trueBreakevenPrice;
              if (isTrueBe) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#10B981', 0.12), border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 700, display: 'block' }}>
                      🛡️ True Breakeven: Capital & Fees Protected (covers ₹{(editSlMetric.feeBufferPoints || 0).toFixed(2)} pts brokerage & govt taxes)
                    </Typography>
                  </Box>
                );
              }

              if (isProfitLock) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#10B981', 0.12), border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 700, display: 'block' }}>
                      🔒 Profit Protected: Locks in +₹{riskPerUnit.toFixed(2)} / unit (~{formatCurrency(totalRiskAmount, 'INR')})
                    </Typography>
                  </Box>
                );
              }

              if (isBe) {
                return (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#3B82F6', 0.12), border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                    <Typography variant="caption" sx={{ color: '#3B82F6', fontWeight: 700, display: 'block' }}>
                      🛡️ Breakeven: Capital Protected (₹0 loss if stopped out)
                    </Typography>
                  </Box>
                );
              }

              return (
                <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha('#F59E0B', 0.12), border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <Typography variant="caption" sx={{ color: '#F59E0B', fontWeight: 700, display: 'block' }}>
                    🔻 Downside Risk: -₹{riskPerUnit.toFixed(2)} / unit (~{formatCurrency(totalRiskAmount, 'INR')})
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
    </>
  );
}
