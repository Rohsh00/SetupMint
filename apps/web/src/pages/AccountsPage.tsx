import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Divider,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Tooltip,
  useTheme,
  Alert,
  Collapse,
  Link,
} from '@mui/material';
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import SouthWestRounded from '@mui/icons-material/SouthWestRounded';
import NorthEastRounded from '@mui/icons-material/NorthEastRounded';
import PaidRounded from '@mui/icons-material/PaidRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import BusinessRounded from '@mui/icons-material/BusinessRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import CloudSyncRounded from '@mui/icons-material/CloudSyncRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CancelRounded from '@mui/icons-material/CancelRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { formatCurrency } from '../lib/utils.js';
import { HelpHint } from '../components/help/index.js';
import { PropFirmAccountCard } from '../components/accounts/PropFirmAccountCard.js';
import { useAccountScope } from '../context/AccountScopeContext.js';

export function AccountsPage() {
  const muiTheme = useTheme();
  const queryClient = useQueryClient();
  const { scope, selectedAccountId, activeAccount, currency: scopeCurrency } = useAccountScope();
  const defaultCurr = activeAccount?.profile?.baseCurrency || scopeCurrency || 'USD';
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedAccountForTx, setSelectedAccountForTx] = useState<any>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [selectedAccountForLink, setSelectedAccountForLink] = useState<any>(null);
  const [linkClientId, setLinkClientId] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
  const [selectedAccountForPending, setSelectedAccountForPending] = useState<any>(null);

  // New Account state
  const [name, setName] = useState('');
  const [broker, setBroker] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('EQUITY');
  const [baseCurrency, setBaseCurrency] = useState(defaultCurr);
  const [initialBalance, setInitialBalance] = useState<number>(100000);

  // Account Profile Wizard state
  const [marketRegion, setMarketRegion] = useState<'IN' | 'US' | 'EU' | 'GLOBAL'>(defaultCurr === 'INR' ? 'IN' : 'US');
  const [timezone, setTimezone] = useState<string>(defaultCurr === 'INR' ? 'Asia/Kolkata' : 'America/New_York');
  const [feeModelKey, setFeeModelKey] = useState<string>(defaultCurr === 'INR' ? 'INDIA_STATUTORY' : 'FOREX_COMMISSION');
  const [executionAdapterKey, setExecutionAdapterKey] = useState<string>(defaultCurr === 'INR' ? 'FYERS' : 'ELEFIN_MT5');
  const [positionModel, setPositionModel] = useState<'NETTING_FIFO' | 'HEDGING'>(defaultCurr === 'INR' ? 'NETTING_FIFO' : 'HEDGING');
  const [sessionCalendarKey, setSessionCalendarKey] = useState<string>(defaultCurr === 'INR' ? 'NSE' : 'FOREX_24_5');

  const handleRegionChange = (region: 'IN' | 'US' | 'EU' | 'GLOBAL') => {
    setMarketRegion(region);
    if (region === 'IN') {
      setBaseCurrency('INR');
      setTimezone('Asia/Kolkata');
      setFeeModelKey('INDIA_STATUTORY');
      setExecutionAdapterKey('FYERS');
      setPositionModel('NETTING_FIFO');
      setSessionCalendarKey('NSE');
    } else if (region === 'US') {
      setBaseCurrency('USD');
      setTimezone('America/New_York');
      setFeeModelKey('FOREX_COMMISSION');
      setExecutionAdapterKey('MANUAL');
      setPositionModel('NETTING_FIFO');
      setSessionCalendarKey('FOREX_24_5');
    } else if (region === 'GLOBAL') {
      setBaseCurrency('USD');
      setTimezone('UTC');
      setFeeModelKey('FOREX_COMMISSION');
      setExecutionAdapterKey(accountType === 'PROP_FIRM' ? 'PROP_SIM' : 'ELEFIN_MT5');
      setPositionModel('HEDGING');
      setSessionCalendarKey('FOREX_24_5');
    } else {
      setBaseCurrency('EUR');
      setTimezone('Europe/London');
      setFeeModelKey('FOREX_COMMISSION');
      setExecutionAdapterKey('MANUAL');
      setPositionModel('NETTING_FIFO');
      setSessionCalendarKey('FOREX_24_5');
    }
  };

  // Prop firm form state
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('THE5ERS_SUMMER');
  const [propFirmName, setPropFirmName] = useState<string>('THE5ERS');
  const [propPlanName, setPropPlanName] = useState('Summer Plan 10/5 ($149)');
  const [propPhase, setPropPhase] = useState<string>('PHASE_1');
  const [propTargetPercent, setPropTargetPercent] = useState<number>(10);
  const [propDailyLossPercent, setPropDailyLossPercent] = useState<number>(3);
  const [propMaxLossPercent, setPropMaxLossPercent] = useState<number>(10);
  const [propMaxLossFloor, setPropMaxLossFloor] = useState<number>(90000);

  // Prop firm rule overrides
  const [showOverrides, setShowOverrides] = useState<boolean>(false);
  const [overrideMinDays, setOverrideMinDays] = useState<number | ''>('');
  const [overrideHoldWeekend, setOverrideHoldWeekend] = useState<'DEFAULT' | 'YES' | 'NO'>('DEFAULT');
  const [overrideNewsTrading, setOverrideNewsTrading] = useState<'DEFAULT' | 'RESTRICTED' | 'ALLOWED'>('DEFAULT');
  const [overrideMandatorySL, setOverrideMandatorySL] = useState<'DEFAULT' | 'YES' | 'NO'>('DEFAULT');
  const [overrideMaxLots, setOverrideMaxLots] = useState<number | ''>('');
  const [overrideMaxRiskPct, setOverrideMaxRiskPct] = useState<number | ''>('');

  const { data: propPresetsRes } = useQuery({
    queryKey: ['prop-presets'],
    queryFn: () => api.accounts.propPresets(),
  });
  const propPresets: any[] = (propPresetsRes as any)?.data || (propPresetsRes as any) || [];

  const activePreset = propPresets.find((p: any) => p.planKey === selectedPresetKey) || {
    firmKey: 'THE5ERS',
    planKey: 'THE5ERS_SUMMER',
    displayName: 'The5ers — Summer Plan ($149 / $100K 10/5)',
    currency: 'USD',
    accountSize: 100000,
    rulesVerifiedAt: '2025-06-01',
    sourceUrl: 'https://the5ers.com/summer-plan',
    phases: [
      { phase: 'PHASE_1', profitTargetPct: 10, minTradingDays: 0 },
      { phase: 'PHASE_2', profitTargetPct: 5, minTradingDays: 0 },
    ],
    dailyLoss: { limitPct: 3, basis: 'HIGHER_OF_BALANCE_EQUITY' },
    maxLoss: { type: 'STATIC', limitPct: 10 },
    holdOvernightAllowed: true,
    holdWeekendAllowed: true,
  };

  const handlePropPresetChange = (presetKey: string) => {
    setSelectedPresetKey(presetKey);
    const p = propPresets.find((item: any) => item.planKey === presetKey);
    if (p) {
      setName(p.displayName || `${p.firmKey} Account`);
      setBroker(p.firmKey === 'THE5ERS' ? 'The5ers' : p.firmKey);
      setAccountType('PROP_FIRM');
      setBaseCurrency(p.currency || 'USD');
      const size = Number(p.accountSize) || 100000;
      setInitialBalance(size);
      setPropFirmName(p.firmKey);
      setPropPlanName(p.displayName);
      const phase1 = p.phases?.[0];
      setPropPhase(phase1?.phase || 'PHASE_1');
      setPropTargetPercent(phase1?.profitTargetPct ?? 10);
      const dailyPct = p.dailyLoss?.limitPct ?? 5;
      setPropDailyLossPercent(dailyPct);
      const maxPct = p.maxLoss?.limitPct ?? 10;
      setPropMaxLossPercent(maxPct);
      setPropMaxLossFloor(size * (1 - maxPct / 100));
    }
  };

  const applyDefaultPropPlan = () => {
    handlePropPresetChange(selectedPresetKey || 'THE5ERS_SUMMER');
  };

  // Transaction state
  const [txType, setTxType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [txAmount, setTxAmount] = useState<number>(10000);
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [txNotes, setTxNotes] = useState('');

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
  });

  const { data: fyersStatus } = useQuery({
    queryKey: ['fyers-status'],
    queryFn: () => api.integrations.fyersStatus(),
  });

  const fyersData = (fyersStatus as any)?.data ?? fyersStatus;
  const isFyersConnected = Boolean(fyersData?.isConnected);
  const connectedClientId = fyersData?.clientId as string | undefined;

  const { data: pendingData, isLoading: isPendingLoading } = useQuery({
    queryKey: ['account-pending', selectedAccountForPending?.id],
    queryFn: () => api.accounts.pendingTransactions(selectedAccountForPending.id),
    enabled: Boolean(selectedAccountForPending?.id && isPendingModalOpen),
  });

  const createAccountMutation = useMutation({
    mutationFn: (payload: any) => api.accounts.create(payload),
    onSuccess: () => {
      setCreateError(null);
      toast.success('Trading account created successfully.');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsAddAccountModalOpen(false);
      setName('');
      setBroker('');
      setAccountNumber('');
      setInitialBalance(100000);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to create trading account';
      setCreateError(msg);
      toast.error(msg);
    },
  });

  const addTxMutation = useMutation({
    mutationFn: ({ accountId, payload }: { accountId: string; payload: any }) =>
      api.accounts.addTransaction(accountId, payload),
    onSuccess: () => {
      setTxError(null);
      toast.success('Transaction recorded successfully.');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsTxModalOpen(false);
      setTxAmount(10000);
      setTxNotes('');
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to record cash flow transaction';
      setTxError(msg);
      toast.error(msg);
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (accountId: string) => api.accounts.reconcile(accountId),
    onSuccess: () => {
      setReconcileError(null);
      toast.success('Account balance reconciled successfully.');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to reconcile account balance';
      setReconcileError(msg);
      toast.error(msg);
    },
  });

  const refreshAccountData = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['fyers-status'] });
    queryClient.invalidateQueries({ queryKey: ['account-pending'] });
  };

  const linkBrokerMutation = useMutation({
    mutationFn: ({ accountId, clientId }: { accountId: string; clientId: string }) =>
      api.accounts.linkBroker(accountId, clientId),
    onSuccess: () => {
      setLinkError(null);
      setIsLinkModalOpen(false);
      toast.success('FYERS account linked successfully.');
      refreshAccountData();
    },
    onError: (err: any) => {
      setLinkError(err.message || 'Failed to link FYERS account');
    },
  });

  const unlinkBrokerMutation = useMutation({
    mutationFn: (accountId: string) => api.accounts.unlinkBroker(accountId),
    onSuccess: () => {
      toast.info('FYERS account link removed.');
      refreshAccountData();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to remove FYERS account link');
    },
  });

  const syncFundsMutation = useMutation({
    mutationFn: (accountId: string) => api.accounts.syncFunds(accountId),
    onSuccess: (result: any, accountId) => {
      refreshAccountData();
      const account = accounts.find((a: any) => a.id === accountId);
      const curr = account?.profile?.baseCurrency || account?.baseCurrency || 'USD';
      const brokerBalStr = result?.brokerBalance != null ? formatCurrency(result.brokerBalance, curr) : '';
      if (result?.suggestionCreated) {
        if (account) {
          setSelectedAccountForPending(account);
          setIsPendingModalOpen(true);
        }
        toast.info(`Broker live balance fetched (${brokerBalStr}). Review the suggested adjustment.`);
      } else if (result?.skipReason === 'WITHIN_TOLERANCE') {
        toast.success(`Broker live balance updated: ${brokerBalStr}. Balances are in sync.`);
      } else if (result?.skipReason === 'OPEN_OR_PLANNED_TRADES') {
        toast.info(`Broker live balance updated: ${brokerBalStr}. Suggestions paused during open trades.`);
      } else if (result?.skipReason === 'PENDING_REVIEW_EXISTS') {
        toast.info(`Broker live balance updated: ${brokerBalStr}. Reconciliation suggestion already awaiting review.`);
      } else {
        toast.success(`Broker live balance updated: ${brokerBalStr}.`);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to sync FYERS funds');
    },
  });

  const confirmPendingMutation = useMutation({
    mutationFn: ({ accountId, txId }: { accountId: string; txId: string }) =>
      api.accounts.confirmTransaction(accountId, txId),
    onSuccess: () => {
      toast.success('Adjustment confirmed and account balance recalculated.');
      refreshAccountData();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to confirm adjustment');
    },
  });

  const rejectPendingMutation = useMutation({
    mutationFn: ({ accountId, txId }: { accountId: string; txId: string }) =>
      api.accounts.rejectTransaction(accountId, txId),
    onSuccess: () => {
      toast.info('Adjustment rejected. Account balance was not changed.');
      refreshAccountData();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to reject adjustment');
    },
  });

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('Please enter an account name.');
      return;
    }

    const ruleSetOverrides: Record<string, any> = {};
    if (activePreset?.dailyLoss?.limitPct !== propDailyLossPercent) {
      ruleSetOverrides.dailyLoss = { limitPct: propDailyLossPercent };
    }
    if (activePreset?.maxLoss?.limitPct !== propMaxLossPercent) {
      ruleSetOverrides.maxLoss = { limitPct: propMaxLossPercent };
    }
    if (overrideMinDays !== '') {
      ruleSetOverrides.minTradingDays = Number(overrideMinDays);
    }
    if (overrideHoldWeekend !== 'DEFAULT') {
      ruleSetOverrides.holdWeekendAllowed = overrideHoldWeekend === 'YES';
    }
    if (overrideNewsTrading !== 'DEFAULT') {
      ruleSetOverrides.newsTradingRestriction = overrideNewsTrading === 'RESTRICTED';
    }
    if (overrideMandatorySL !== 'DEFAULT') {
      ruleSetOverrides.mandatoryStopLoss = overrideMandatorySL === 'YES';
    }
    if (overrideMaxLots !== '') {
      ruleSetOverrides.maxLotsOrContracts = Number(overrideMaxLots);
    }
    if (overrideMaxRiskPct !== '') {
      ruleSetOverrides.maxRiskPerTradePct = Number(overrideMaxRiskPct);
    }

    const propFirm =
      accountType === 'PROP_FIRM'
        ? {
            firmKey: activePreset?.firmKey || propFirmName,
            planKey: activePreset?.planKey || selectedPresetKey,
            phase: propPhase,
            startingBalance: Number(initialBalance) || 100000,
            status: 'ACTIVE' as const,
            ruleSetOverrides: Object.keys(ruleSetOverrides).length > 0 ? ruleSetOverrides : undefined,
          }
        : undefined;

    const propFirmConfig =
      accountType === 'PROP_FIRM'
        ? {
            enabled: true,
            firm: activePreset?.firmKey || propFirmName,
            planName: activePreset?.displayName || propPlanName,
            phase: propPhase as any,
            initialBalance: Number(initialBalance) || 100000,
            targetProfitPercent: Number(propTargetPercent),
            dailyLossLimitPercent: Number(propDailyLossPercent),
            dailyLossReference: 'STARTING_BALANCE' as const,
            maxLossLimitPercent: Number(propMaxLossPercent),
            maxLossType: 'STATIC_FROM_INITIAL' as const,
            maxLossFloor: Number(propMaxLossFloor) || (Number(initialBalance) || 100000) * 0.9,
            minTradingDays: Number(overrideMinDays) || 0,
            newsTradingAllowed: overrideNewsTrading !== 'RESTRICTED',
            weekendHoldingAllowed: overrideHoldWeekend !== 'NO',
            status: 'ACTIVE' as const,
          }
        : undefined;

    const profile = {
      marketRegion,
      baseCurrency,
      timezone,
      feeModelKey,
      executionAdapterKey,
      positionModel,
      sessionCalendarKey,
      riskRules: {
        maxRiskPerTradePct: overrideMaxRiskPct !== '' ? Number(overrideMaxRiskPct) : 2.0,
        dailyLossLimitPct: propDailyLossPercent || 3.0,
        maxDrawdownPct: propMaxLossPercent || 10.0,
        mandatoryStopLoss: overrideMandatorySL === 'YES',
        allowWeekendHolding: overrideHoldWeekend !== 'NO',
        allowNewsTrading: overrideNewsTrading !== 'RESTRICTED',
        maxLotsOrContracts: overrideMaxLots !== '' ? Number(overrideMaxLots) : undefined,
      },
      capabilities: {
        canPlaceOrders: executionAdapterKey !== 'MANUAL',
        canModifyStopLoss: executionAdapterKey !== 'MANUAL',
        canExitPositions: executionAdapterKey !== 'MANUAL',
        canScaleLadder: executionAdapterKey === 'FYERS' || executionAdapterKey === 'ELEFIN_MT5',
        canAutoExecute: executionAdapterKey === 'FYERS',
        canSyncFunds: executionAdapterKey === 'FYERS',
        canFetchHistory: executionAdapterKey === 'FYERS' || executionAdapterKey === 'ELEFIN_MT5',
        canStreamQuotes: executionAdapterKey === 'FYERS' || executionAdapterKey === 'ELEFIN_MT5' || executionAdapterKey === 'PROP_SIM',
      },
    };

    createAccountMutation.mutate({
      name,
      broker,
      accountNumber,
      accountType,
      baseCurrency,
      initialBalance: Number(initialBalance) || 0,
      profile,
      propFirm,
      propFirmConfig,
    });
  };

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountForTx) return;

    const amt = Number(txAmount);
    if (!amt || amt <= 0) {
      toast.warning('Please enter a valid transaction amount greater than 0.');
      return;
    }

    addTxMutation.mutate({
      accountId: selectedAccountForTx.id || selectedAccountForTx._id,
      payload: {
        type: txType,
        amount: amt,
        currency: selectedAccountForTx.baseCurrency,
        date: txDate,
        notes: txNotes,
      },
    });
  };

  const displayedAccounts = React.useMemo(() => {
    if (selectedAccountId && selectedAccountId !== 'ALL') {
      return accounts.filter((a: any) => a.id === selectedAccountId || a._id === selectedAccountId);
    }
    if (scope.mode === 'PROP_FIRM') {
      return accounts.filter((a: any) => {
        const isProp =
          a.accountType === 'PROP_FIRM' ||
          Boolean(a.propFirm?.firmKey) ||
          Boolean(a.propFirmConfig?.enabled);
        if (!isProp) return false;
        if (scope.firmKey && scope.firmKey !== 'ALL') {
          const fk = (a.propFirm?.firmKey || a.propFirmConfig?.firm || '').toLowerCase();
          return fk === scope.firmKey.toLowerCase();
        }
        return true;
      });
    }
    if (scope.mode === 'TYPE') {
      if (scope.accountType === 'DEMO') {
        return accounts.filter((a: any) => a.accountType === 'DEMO' || a.accountType === 'SIMULATED');
      }
      return accounts.filter(
        (a: any) =>
          a.accountType !== 'PROP_FIRM' &&
          a.accountType !== 'DEMO' &&
          a.accountType !== 'SIMULATED' &&
          !a.propFirm?.firmKey &&
          !a.propFirmConfig?.enabled
      );
    }
    return accounts;
  }, [accounts, scope.mode, scope.firmKey, scope.accountType, selectedAccountId]);

  const currencyTotals = React.useMemo(() => {
    const map = new Map<string, { equity: number; pnl: number }>();
    for (const a of displayedAccounts) {
      const curr = a.profile?.baseCurrency || a.baseCurrency || 'USD';
      const entry = map.get(curr) || { equity: 0, pnl: 0 };
      entry.equity += a.currentBalance || 0;
      entry.pnl += a.realizedPnL || 0;
      map.set(curr, entry);
    }
    return Array.from(map.entries());
  }, [displayedAccounts]);

  const totalConsolidatedEquityStr =
    currencyTotals.length === 0
      ? formatCurrency(0)
      : currencyTotals.map(([curr, t]) => formatCurrency(t.equity, curr)).join(' • ');

  const totalConsolidatedPnLStr =
    currencyTotals.length === 0
      ? formatCurrency(0)
      : currencyTotals.map(([curr, t]) => formatCurrency(t.pnl, curr)).join(' • ');

  const isOverallPnlPositive =
    currencyTotals.length === 0 || currencyTotals.every(([, t]) => t.pnl >= 0);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {reconcileError && (
        <Alert severity="error" onClose={() => setReconcileError(null)}>
          {reconcileError}
        </Alert>
      )}
      {/* Top Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, pb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccountBalanceWalletRounded sx={{ color: 'primary.main', fontSize: 28 }} />
              Trading Accounts & Cash Flow
            </Typography>
            <HelpHint hintKey="account.balanceFormula" />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Manage brokerage sub-accounts, cash deposits, withdrawals, and consolidated portfolio balances
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<ShieldRounded />}
            onClick={() => {
              applyDefaultPropPlan();
              setIsAddAccountModalOpen(true);
            }}
            sx={{ fontWeight: 600 }}
          >
            Add Prop Firm Challenge
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddRounded />}
            onClick={() => setIsAddAccountModalOpen(true)}
            sx={{ fontWeight: 600, px: 2.5 }}
          >
            Add Trading Account
          </Button>
        </Box>
      </Box>

      {/* Portfolio Totals Strip */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', p: 1 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', mb: 0.5 }}>
                Consolidated Portfolio Equity
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: '"JetBrains Mono", monospace', fontSize: currencyTotals.length > 1 ? '1.35rem' : undefined }}>
                {totalConsolidatedEquityStr}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', p: 1 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', mb: 0.5 }}>
                Total Realized P&L
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: currencyTotals.length > 1 ? '1.35rem' : undefined,
                  color: isOverallPnlPositive ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                }}
              >
                {totalConsolidatedPnLStr}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', p: 1 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', mb: 0.5 }}>
                Active Broker Accounts
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: '"JetBrains Mono", monospace' }}>
                {displayedAccounts.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Accounts List */}
      <Grid container spacing={3}>
        {isLoading ? (
          <Grid size={{ xs: 12 }}>
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Loading brokerage accounts...</Typography>
            </Box>
          </Grid>
        ) : (
          displayedAccounts.map((acc: any) => {
            const isProfitable = (acc.realizedPnL || 0) >= 0;

            return (
              <Grid size={{ xs: 12, md: 6, lg: 4 }} key={acc.id}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: muiTheme.palette.mode === 'dark' ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.08)',
                    },
                  }}
                >
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                          {acc.name}
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <BusinessRounded sx={{ fontSize: 13 }} />
                          {acc.broker} • {acc.accountType} ({acc.baseCurrency})
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={acc.status || 'ACTIVE'}
                        color={acc.status === 'ARCHIVED' ? 'default' : 'success'}
                        variant="outlined"
                        sx={{ fontSize: '0.65rem', fontWeight: 700, height: 20 }}
                      />
                    </Box>

                    {/* Account Balances Grid */}
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 2,
                        p: 1.5,
                        my: 2,
                        borderRadius: 1.5,
                        bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        border: 1,
                        borderColor: 'divider',
                      }}
                    >
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Current Equity
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                          {formatCurrency(acc.currentBalance, acc.baseCurrency)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                          Realized P&L
                        </Typography>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 700,
                            fontFamily: '"JetBrains Mono", monospace',
                            color: isProfitable ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                          }}
                        >
                          {formatCurrency(acc.realizedPnL, acc.baseCurrency)}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Cash Flow Details */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Opening Balance:</span>
                        <Typography variant="caption" sx={{ fontFamily: 'inherit', fontWeight: 600, color: 'text.primary' }}>
                          {formatCurrency(acc.initialBalance, acc.baseCurrency)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Deposits:</span>
                        <Typography variant="caption" sx={{ fontFamily: 'inherit', fontWeight: 600, color: muiTheme.palette.profit.main }}>
                          +{formatCurrency(acc.totalDeposits, acc.baseCurrency)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Withdrawals:</span>
                        <Typography variant="caption" sx={{ fontFamily: 'inherit', fontWeight: 600, color: muiTheme.palette.loss.main }}>
                          -{formatCurrency(acc.totalWithdrawals, acc.baseCurrency)}
                        </Typography>
                      </Box>
                      {Number(acc.totalAdjustments || 0) !== 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Net Adjustments:</span>
                          <Typography variant="caption" sx={{ fontFamily: 'inherit', fontWeight: 600 }}>
                            {formatCurrency(acc.totalAdjustments, acc.baseCurrency)}
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    {String(acc.broker || '').toUpperCase() === 'FYERS' && (
                      <Box
                        sx={{
                          mt: 1.5,
                          p: 1.5,
                          borderRadius: 1.5,
                          border: 1,
                          borderColor: acc.liveBalance ? 'rgba(16, 185, 129, 0.4)' : 'divider',
                          bgcolor: acc.liveBalance
                            ? (muiTheme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.07)' : 'rgba(16, 185, 129, 0.05)')
                            : (muiTheme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: isFyersConnected ? 'success.main' : 'warning.main',
                                boxShadow: isFyersConnected ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
                              }}
                            />
                            <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.02em' }}>
                              FYERS Live Funds
                            </Typography>
                            {acc.brokerLink?.clientId && (
                              <Chip
                                size="small"
                                label={acc.brokerLink.clientId}
                                sx={{ height: 18, fontSize: '0.625rem', fontFamily: '"JetBrains Mono", monospace' }}
                              />
                            )}
                          </Box>
                          {acc.liveBalance?.fetchedAt ? (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                              Synced {new Date(acc.liveBalance.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Typography>
                          ) : (
                            <Chip
                              label={isFyersConnected ? 'READY' : 'AUTH REQUIRED'}
                              size="small"
                              color={isFyersConnected ? 'success' : 'warning'}
                              variant="outlined"
                              sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
                            />
                          )}
                        </Box>

                        {acc.liveBalance ? (
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: 1.5,
                              pt: 0.5,
                            }}
                          >
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6875rem' }}>
                                Clear Balance
                              </Typography>
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 800,
                                  color: 'success.main',
                                  fontFamily: '"JetBrains Mono", monospace',
                                  lineHeight: 1.2,
                                }}
                              >
                                {formatCurrency(acc.liveBalance.clearBalance, acc.baseCurrency)}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.6875rem' }}>
                                Available Margin
                              </Typography>
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 700,
                                  fontFamily: '"JetBrains Mono", monospace',
                                  lineHeight: 1.2,
                                }}
                              >
                                {formatCurrency(acc.liveBalance.availableBalance, acc.baseCurrency)}
                              </Typography>
                            </Box>
                          </Box>
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {isFyersConnected ? 'Live balance not yet fetched' : 'Connect FYERS to fetch live balance'}
                            </Typography>
                            {isFyersConnected && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="success"
                                startIcon={<CloudSyncRounded sx={{ fontSize: 14 }} />}
                                disabled={syncFundsMutation.isPending}
                                onClick={() => syncFundsMutation.mutate(acc.id)}
                                sx={{ fontSize: '0.6875rem', py: 0.25, px: 1, minHeight: 0 }}
                              >
                                {syncFundsMutation.isPending ? 'Fetching...' : 'Fetch Live'}
                              </Button>
                            )}
                          </Box>
                        )}
                      </Box>
                    )}

                    {(acc.accountType === 'PROP_FIRM' || acc.propFirmConfig?.enabled) && (
                      <PropFirmAccountCard account={acc} />
                    )}
                  </CardContent>

                  <Divider sx={{ my: 0.5 }} />

                  <CardActions sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PaidRounded sx={{ fontSize: 16 }} />}
                        onClick={() => {
                          setSelectedAccountForTx(acc);
                          setIsTxModalOpen(true);
                        }}
                        sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        Cash Flow
                      </Button>

                      {(String(acc.broker || '').toUpperCase() === 'FYERS' || acc.profile?.capabilities?.canSyncFunds) && (
                        <>
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            startIcon={<CloudSyncRounded sx={{ fontSize: 16 }} />}
                            disabled={!isFyersConnected || syncFundsMutation.isPending}
                            onClick={() => syncFundsMutation.mutate(acc.id)}
                            sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                          >
                            {syncFundsMutation.isPending ? 'Syncing...' : 'Sync Balance'}
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="inherit"
                            startIcon={<FactCheckRounded sx={{ fontSize: 16 }} />}
                            onClick={() => {
                              setSelectedAccountForPending(acc);
                              setIsPendingModalOpen(true);
                            }}
                            sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                          >
                            Reconcile
                          </Button>
                          <HelpHint hintKey="account.pendingAdjustment" />
                        </>
                      )}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {acc.brokerLink && (
                        <Tooltip title="Remove the FYERS link from this account" arrow>
                          <span>
                            <Button
                              size="small"
                              color="error"
                              disabled={unlinkBrokerMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Remove FYERS link ${acc.brokerLink.clientId} from ${acc.name}?`)) {
                                  unlinkBrokerMutation.mutate(acc.id);
                                }
                              }}
                              sx={{ fontSize: '0.75rem', minWidth: 0, px: 1 }}
                            >
                              Unlink
                            </Button>
                          </span>
                        </Tooltip>
                      )}
                      <Tooltip title="Authoritatively reconcile account balance and P&L from raw execution fills" arrow>
                        <span>
                          <Button
                            size="small"
                            color="inherit"
                            disabled={reconcileMutation.isPending}
                            onClick={() => reconcileMutation.mutate(acc.id || acc._id)}
                            startIcon={
                              <SyncRounded
                                sx={{
                                  fontSize: 16,
                                  animation: reconcileMutation.isPending ? 'spin 1s linear infinite' : 'none',
                                  '@keyframes spin': {
                                    '0%': { transform: 'rotate(0deg)' },
                                    '100%': { transform: 'rotate(360deg)' },
                                  },
                                }}
                              />
                            }
                            sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
                          >
                            Reconcile
                          </Button>
                        </span>
                      </Tooltip>
                      <HelpHint hintKey="account.reconcile" />
                    </Box>
                  </CardActions>
                </Card>
              </Grid>
            );
          })
        )}
      </Grid>

      {/* Add Account Modal */}
      <Dialog
        open={isAddAccountModalOpen}
        onClose={() => setIsAddAccountModalOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              backgroundImage: 'none',
              bgcolor: 'background.paper',
              borderRadius: 2,
            },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Add Trading Account</Typography>
            <Typography variant="caption" color="text.secondary">Configure a new brokerage sub-account with initial deposit balance</Typography>
          </Box>
          <IconButton size="small" onClick={() => setIsAddAccountModalOpen(false)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleCreateAccount}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            {createError && (
              <Alert severity="error" onClose={() => setCreateError(null)}>
                {createError}
              </Alert>
            )}
            <TextField
              label="Account Name *"
              placeholder="e.g. Zerodha F&O Primary"
              size="small"
              required
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Broker *"
                placeholder="Zerodha, Dhan, Fyers, ICICI"
                size="small"
                required
                fullWidth
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
              />
              <TextField
                label="Account ID (Optional)"
                placeholder="e.g. ZR1234"
                size="small"
                fullWidth
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                select
                label="Account Type"
                size="small"
                fullWidth
                value={accountType}
                onChange={(e) => {
                  const val = e.target.value;
                  setAccountType(val);
                  if (val === 'PROP_FIRM') {
                    applyDefaultPropPlan();
                  }
                }}
              >
                <MenuItem value="EQUITY">Equity</MenuItem>
                <MenuItem value="FUTURES_OPTIONS">Futures & Options</MenuItem>
                <MenuItem value="COMMODITY">Commodity (MCX)</MenuItem>
                <MenuItem value="FOREX">Forex</MenuItem>
                <MenuItem value="CRYPTO">Crypto</MenuItem>
                <MenuItem value="PROP_FIRM">Prop Firm</MenuItem>
              </TextField>

              <TextField
                select
                label="Market Region"
                size="small"
                fullWidth
                value={marketRegion}
                onChange={(e) => handleRegionChange(e.target.value as any)}
              >
                <MenuItem value="IN">India (NSE/MCX, IST)</MenuItem>
                <MenuItem value="GLOBAL">Global Forex / CFD</MenuItem>
                <MenuItem value="US">US Markets (EST)</MenuItem>
                <MenuItem value="EU">European Markets</MenuItem>
              </TextField>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                select
                label="Base Currency"
                size="small"
                fullWidth
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
              >
                <MenuItem value="INR">INR (Indian Rupee)</MenuItem>
                <MenuItem value="USD">USD (US Dollar)</MenuItem>
                <MenuItem value="EUR">EUR (Euro)</MenuItem>
                <MenuItem value="GBP">GBP (British Pound)</MenuItem>
                <MenuItem value="AED">AED (UAE Dirham)</MenuItem>
                <MenuItem value="AUD">AUD (Australian Dollar)</MenuItem>
                <MenuItem value="CAD">CAD (Canadian Dollar)</MenuItem>
                <MenuItem value="JPY">JPY (Japanese Yen)</MenuItem>
              </TextField>

              <TextField
                select
                label="Timezone (IANA)"
                size="small"
                fullWidth
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <MenuItem value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</MenuItem>
                <MenuItem value="America/New_York">America/New_York (EST/EDT)</MenuItem>
                <MenuItem value="UTC">UTC (+0:00)</MenuItem>
                <MenuItem value="Europe/London">Europe/London (GMT/BST)</MenuItem>
                <MenuItem value="Asia/Dubai">Asia/Dubai (GST +4:00)</MenuItem>
                <MenuItem value="Asia/Tokyo">Asia/Tokyo (JST +9:00)</MenuItem>
              </TextField>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                select
                label="Execution Adapter"
                size="small"
                fullWidth
                value={executionAdapterKey}
                onChange={(e) => setExecutionAdapterKey(e.target.value)}
              >
                <MenuItem value="FYERS">FYERS Direct Live</MenuItem>
                <MenuItem value="ELEFIN_MT5">Elefin MT5 Bridge</MenuItem>
                <MenuItem value="PROP_SIM">Prop Firm Simulated</MenuItem>
                <MenuItem value="MANUAL">Manual / Read-Only</MenuItem>
              </TextField>

              <TextField
                select
                label="Fee Model"
                size="small"
                fullWidth
                value={feeModelKey}
                onChange={(e) => setFeeModelKey(e.target.value)}
              >
                <MenuItem value="INDIA_STATUTORY">India Statutory (STT, GST, Stamp)</MenuItem>
                <MenuItem value="FOREX_COMMISSION">Forex Commission ($7/rt, Swap, Spread)</MenuItem>
                <MenuItem value="NONE">Zero Commission</MenuItem>
                <MenuItem value="CUSTOM">Custom Flat Fee</MenuItem>
              </TextField>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                select
                label="Position Model"
                size="small"
                fullWidth
                value={positionModel}
                onChange={(e) => setPositionModel(e.target.value as any)}
              >
                <MenuItem value="NETTING_FIFO">Netting FIFO (Single Position)</MenuItem>
                <MenuItem value="HEDGING">Hedging (Ticket Isolation)</MenuItem>
              </TextField>

              <TextField
                select
                label="Session Calendar"
                size="small"
                fullWidth
                value={sessionCalendarKey}
                onChange={(e) => setSessionCalendarKey(e.target.value)}
              >
                <MenuItem value="NSE">NSE (09:15 - 15:30 IST)</MenuItem>
                <MenuItem value="MCX">MCX (09:00 - 23:30 IST)</MenuItem>
                <MenuItem value="FOREX_24_5">Forex (24/5 Asia/London/NY)</MenuItem>
                <MenuItem value="CRYPTO_24_7">Crypto (24/7 Continuous)</MenuItem>
              </TextField>
            </Box>

            <TextField
              label="Starting Initial Balance *"
              type="number"
              size="small"
              required
              fullWidth
              value={initialBalance}
              onChange={(e) => {
                const val = Number(e.target.value);
                setInitialBalance(val);
                if (accountType === 'PROP_FIRM') {
                  setPropMaxLossFloor(val * (1 - propMaxLossPercent / 100));
                }
              }}
              slotProps={{ htmlInput: { min: 0, step: 'any', style: { fontFamily: '"JetBrains Mono", monospace' } } }}
            />

            {accountType === 'PROP_FIRM' && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor:
                    muiTheme.palette.mode === 'dark'
                      ? 'rgba(99, 102, 241, 0.05)'
                      : 'rgba(99, 102, 241, 0.03)',
                  border: 1,
                  borderColor: 'primary.main',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ShieldRounded sx={{ color: 'primary.main', fontSize: 20 }} />
                    Prop Firm Challenge Configuration
                  </Typography>
                  <Chip
                    label={activePreset?.firmKey || 'PROP FIRM'}
                    size="small"
                    color="primary"
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                  />
                </Box>

                {/* Preset selector */}
                <TextField
                  select
                  label="Prop Firm Plan Preset *"
                  size="small"
                  fullWidth
                  value={selectedPresetKey}
                  onChange={(e) => handlePropPresetChange(e.target.value)}
                >
                  {propPresets.length > 0 ? (
                    propPresets.map((preset: any) => (
                      <MenuItem key={preset.planKey} value={preset.planKey}>
                        {preset.displayName} ({preset.currency || 'USD'} {Number(preset.accountSize).toLocaleString()})
                      </MenuItem>
                    ))
                  ) : (
                    <>
                      <MenuItem value="THE5ERS_SUMMER">The5ers — Summer Plan ($149 / $100K 10/5)</MenuItem>
                      <MenuItem value="THE5ERS_HIGH_STAKES">The5ers — High Stakes (8/5)</MenuItem>
                      <MenuItem value="FTMO_STANDARD_100K">FTMO — Standard (10/5)</MenuItem>
                      <MenuItem value="CUSTOM_PROP_PLAN">Custom Prop Plan</MenuItem>
                    </>
                  )}
                </TextField>

                {/* Preset verification date & official rules URL */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  {activePreset?.rulesVerifiedAt ? (
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                      Rules last verified: <strong>{activePreset.rulesVerifiedAt}</strong>
                    </Typography>
                  ) : (
                    <Typography variant="caption" sx={{ color: 'warning.main', fontSize: '0.7rem' }}>
                      Verification date not specified
                    </Typography>
                  )}
                  {activePreset?.sourceUrl && (
                    <Link
                      href={activePreset.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: 'primary.main',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      Official Firm Rules <OpenInNewRounded sx={{ fontSize: 12 }} />
                    </Link>
                  )}
                </Box>

                {/* Check for NOT CONFIGURED rules in this preset */}
                {(() => {
                  const missing: string[] = [];
                  if (activePreset?.newsTradingRestriction === undefined) missing.push('News Trading Window');
                  if (activePreset?.holdWeekendAllowed === undefined) missing.push('Weekend Holding');
                  if (activePreset?.holdOvernightAllowed === undefined) missing.push('Overnight Holding');
                  if (activePreset?.mandatoryStopLoss === undefined) missing.push('Mandatory Stop Loss');
                  if (missing.length > 0) {
                    return (
                      <Alert severity="info" icon={<HelpOutlineRounded />} sx={{ py: 0.25, fontSize: '0.725rem' }}>
                        Rule not configured in this preset: <strong>{missing.join(', ')}</strong>. You can configure custom overrides below.
                      </Alert>
                    );
                  }
                  return null;
                })()}

                {/* Phase Selection and Profit Target */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField
                    label="Starting Phase"
                    select
                    size="small"
                    value={propPhase}
                    onChange={(e) => {
                      const newPhase = e.target.value;
                      setPropPhase(newPhase);
                      const phaseObj = activePreset?.phases?.find((p: any) => p.phase === newPhase);
                      if (phaseObj?.profitTargetPct != null) {
                        setPropTargetPercent(phaseObj.profitTargetPct);
                      }
                    }}
                  >
                    {activePreset?.phases && activePreset.phases.length > 0 ? (
                      activePreset.phases.map((ph: any) => (
                        <MenuItem key={ph.phase} value={ph.phase}>
                          {ph.phase === 'PHASE_1'
                            ? `Phase 1 (${ph.profitTargetPct}% Target)`
                            : ph.phase === 'PHASE_2'
                            ? `Phase 2 (${ph.profitTargetPct}% Target)`
                            : ph.phase === 'PHASE_3'
                            ? `Phase 3 (${ph.profitTargetPct}% Target)`
                            : 'Funded Master'}
                        </MenuItem>
                      ))
                    ) : (
                      <>
                        <MenuItem value="PHASE_1">Phase 1 (10% Target)</MenuItem>
                        <MenuItem value="PHASE_2">Phase 2 (5% Target)</MenuItem>
                        <MenuItem value="FUNDED">Funded Master</MenuItem>
                      </>
                    )}
                  </TextField>

                  <TextField
                    label="Target Profit %"
                    type="number"
                    size="small"
                    value={propTargetPercent}
                    onChange={(e) => setPropTargetPercent(Number(e.target.value))}
                  />
                </Box>

                {/* Daily Loss & Max Loss Floors */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField
                    label="Daily Loss Limit %"
                    type="number"
                    size="small"
                    value={propDailyLossPercent}
                    onChange={(e) => setPropDailyLossPercent(Number(e.target.value))}
                    helperText={
                      activePreset?.dailyLoss?.basis
                        ? `Basis: ${activePreset.dailyLoss.basis}`
                        : 'Higher of EOD balance or equity'
                    }
                  />

                  <TextField
                    label="Static / Trailing Max Loss Floor"
                    type="number"
                    size="small"
                    value={propMaxLossFloor}
                    onChange={(e) => setPropMaxLossFloor(Number(e.target.value))}
                    helperText={
                      activePreset?.maxLoss?.type
                        ? `Type: ${activePreset.maxLoss.type} (${propMaxLossPercent}%)`
                        : `Fixed floor (${propMaxLossPercent}%)`
                    }
                  />
                </Box>

                {/* Overrides Collapsible Section */}
                <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
                  <Button
                    size="small"
                    startIcon={<TuneRounded />}
                    onClick={() => setShowOverrides(!showOverrides)}
                    sx={{ fontSize: '0.725rem', fontWeight: 600, textTransform: 'none', px: 0 }}
                  >
                    {showOverrides ? 'Hide Custom Rule Overrides' : 'Configure Custom Rule Overrides'}
                  </Button>

                  <Collapse in={showOverrides}>
                    <Box sx={{ pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                        <TextField
                          label="Min Trading Days Override"
                          type="number"
                          size="small"
                          placeholder={String(activePreset?.phases?.[0]?.minTradingDays ?? 0)}
                          value={overrideMinDays}
                          onChange={(e) => setOverrideMinDays(e.target.value === '' ? '' : Number(e.target.value))}
                          helperText="0 = no minimum required"
                        />
                        <TextField
                          select
                          label="Weekend Holding Override"
                          size="small"
                          value={overrideHoldWeekend}
                          onChange={(e) => setOverrideHoldWeekend(e.target.value as any)}
                        >
                          <MenuItem value="DEFAULT">Preset Default ({activePreset?.holdWeekendAllowed ? 'Allowed' : 'Prohibited'})</MenuItem>
                          <MenuItem value="YES">Permitted (Allowed)</MenuItem>
                          <MenuItem value="NO">Banned (Prohibited)</MenuItem>
                        </TextField>
                      </Box>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                        <TextField
                          select
                          label="News Trading Override"
                          size="small"
                          value={overrideNewsTrading}
                          onChange={(e) => setOverrideNewsTrading(e.target.value as any)}
                        >
                          <MenuItem value="DEFAULT">Preset Default ({activePreset?.newsTradingRestriction ? 'Restricted' : 'Allowed'})</MenuItem>
                          <MenuItem value="ALLOWED">Allowed</MenuItem>
                          <MenuItem value="RESTRICTED">Restricted (± Window)</MenuItem>
                        </TextField>

                        <TextField
                          select
                          label="Mandatory Stop Loss Override"
                          size="small"
                          value={overrideMandatorySL}
                          onChange={(e) => setOverrideMandatorySL(e.target.value as any)}
                        >
                          <MenuItem value="DEFAULT">Preset Default ({activePreset?.mandatoryStopLoss ? 'Required' : 'Not Required'})</MenuItem>
                          <MenuItem value="YES">Required on every trade</MenuItem>
                          <MenuItem value="NO">Not required</MenuItem>
                        </TextField>
                      </Box>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                        <TextField
                          label="Max Lot / Contract Cap Override"
                          type="number"
                          size="small"
                          placeholder={activePreset?.maxLotsOrContracts ? String(activePreset.maxLotsOrContracts) : 'None'}
                          value={overrideMaxLots}
                          onChange={(e) => setOverrideMaxLots(e.target.value === '' ? '' : Number(e.target.value))}
                        />
                        <TextField
                          label="Max Risk Per Trade % Override"
                          type="number"
                          size="small"
                          placeholder={activePreset?.maxRiskPerTradePct ? String(activePreset.maxRiskPerTradePct) : 'None'}
                          value={overrideMaxRiskPct}
                          onChange={(e) => setOverrideMaxRiskPct(e.target.value === '' ? '' : Number(e.target.value))}
                        />
                      </Box>
                    </Box>
                  </Collapse>
                </Box>
              </Box>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setIsAddAccountModalOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={createAccountMutation.isPending}
            >
              {createAccountMutation.isPending ? 'Creating...' : 'Create Account'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Cash Flow Transaction Modal */}
      {selectedAccountForTx && (
        <Dialog
          open={isTxModalOpen}
          onClose={() => setIsTxModalOpen(false)}
          maxWidth="xs"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                backgroundImage: 'none',
                bgcolor: 'background.paper',
                borderRadius: 2,
              },
            },
          }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Record Cash Flow</Typography>
              <Typography variant="caption" color="text.secondary">{selectedAccountForTx.name}</Typography>
            </Box>
            <IconButton size="small" onClick={() => setIsTxModalOpen(false)}>
              <CloseRounded />
            </IconButton>
          </DialogTitle>

          <form onSubmit={handleAddTx}>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
              {txError && (
                <Alert severity="error" onClose={() => setTxError(null)}>
                  {txError}
                </Alert>
              )}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                  Transaction Type
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={txType}
                  onChange={(_, val) => val && setTxType(val)}
                >
                  <ToggleButton
                    value="DEPOSIT"
                    sx={{
                      py: 1,
                      fontWeight: 700,
                      gap: 0.5,
                      '&.Mui-selected': {
                        bgcolor: `${muiTheme.palette.profit.main}20 !important`,
                        color: `${muiTheme.palette.profit.main} !important`,
                        borderColor: `${muiTheme.palette.profit.main} !important`,
                      },
                    }}
                  >
                    <SouthWestRounded sx={{ fontSize: 16 }} />
                    Deposit
                  </ToggleButton>
                  <ToggleButton
                    value="WITHDRAWAL"
                    sx={{
                      py: 1,
                      fontWeight: 700,
                      gap: 0.5,
                      '&.Mui-selected': {
                        bgcolor: `${muiTheme.palette.loss.main}20 !important`,
                        color: `${muiTheme.palette.loss.main} !important`,
                        borderColor: `${muiTheme.palette.loss.main} !important`,
                      },
                    }}
                  >
                    <NorthEastRounded sx={{ fontSize: 16 }} />
                    Withdrawal
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <TextField
                label={`Amount (${selectedAccountForTx.baseCurrency}) *`}
                type="number"
                size="small"
                required
                fullWidth
                value={txAmount}
                onChange={(e) => setTxAmount(Number(e.target.value))}
                slotProps={{ htmlInput: { min: 0.01, step: 'any', style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />

              <TextField
                label="Date *"
                type="date"
                size="small"
                required
                fullWidth
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />

              <TextField
                label="Notes / Reference"
                placeholder="e.g. Capital injection, payout to bank"
                size="small"
                fullWidth
                value={txNotes}
                onChange={(e) => setTxNotes(e.target.value)}
              />
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setIsTxModalOpen(false)} color="inherit">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                color={txType === 'DEPOSIT' ? 'primary' : 'error'}
                disabled={addTxMutation.isPending}
              >
                {addTxMutation.isPending ? 'Recording...' : `Record ${txType === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}`}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      )}

      {/* FYERS Link Modal */}
      {selectedAccountForLink && (
        <Dialog open={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Link FYERS Account</Typography>
              <Typography variant="caption" color="text.secondary">{selectedAccountForLink.name}</Typography>
            </Box>
            <IconButton size="small" onClick={() => setIsLinkModalOpen(false)}>
              <CloseRounded />
            </IconButton>
          </DialogTitle>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!linkClientId.trim()) {
                setLinkError('Enter the FYERS client ID.');
                return;
              }
              linkBrokerMutation.mutate({
                accountId: selectedAccountForLink.id,
                clientId: linkClientId.trim(),
              });
            }}
          >
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              {!isFyersConnected && (
                <Alert severity="warning">
                  Connect FYERS in Settings before linking this account.
                </Alert>
              )}
              {linkError && (
                <Alert severity="error" onClose={() => setLinkError(null)}>
                  {linkError}
                </Alert>
              )}
              <TextField
                label="FYERS Client ID *"
                size="small"
                fullWidth
                value={linkClientId}
                onChange={(e) => setLinkClientId(e.target.value.trim())}
                helperText={
                  connectedClientId
                    ? `Connected client: ${connectedClientId}`
                    : 'Use the client ID shown in your FYERS account'
                }
                slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
              <Alert severity="info" sx={{ fontSize: '0.8125rem' }}>
                Linking only associates this SetupMint account with FYERS funds snapshots. Broker balances never overwrite your ledger automatically.
              </Alert>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setIsLinkModalOpen(false)} color="inherit">Cancel</Button>
              <Button
                type="submit"
                variant="contained"
                color="success"
                disabled={!isFyersConnected || linkBrokerMutation.isPending}
              >
                {linkBrokerMutation.isPending ? 'Linking...' : 'Link Account'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      )}

      {/* FYERS Pending Reconciliation Modal */}
      {selectedAccountForPending && (
        <Dialog
          open={isPendingModalOpen}
          onClose={() => setIsPendingModalOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Broker Reconciliation</Typography>
              <Typography variant="caption" color="text.secondary">
                {selectedAccountForPending.name} • FYERS {selectedAccountForPending.brokerLink?.clientId}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setIsPendingModalOpen(false)}>
              <CloseRounded />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {isPendingLoading ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">Loading broker reconciliation...</Typography>
              </Box>
            ) : (
              <>
                {pendingData?.latestSnapshot ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' },
                      gap: 1.5,
                      p: 1.5,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1.5,
                    }}
                  >
                    {[
                      ['Total Balance', pendingData.latestSnapshot.totalBalance],
                      ['Clear Balance', pendingData.latestSnapshot.clearBalance],
                      ['Available Balance', pendingData.latestSnapshot.availableBalance],
                      ['Realized P&L', pendingData.latestSnapshot.realizedPnL],
                      ['Utilized Amount', pendingData.latestSnapshot.utilizedAmount],
                    ].map(([label, value]) => (
                      <Box key={String(label)}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {label}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                          {formatCurrency(Number(value), selectedAccountForPending.baseCurrency)}
                        </Typography>
                      </Box>
                    ))}
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Snapshot Time
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {new Date(pendingData.latestSnapshot.fetchedAt).toLocaleString()}
                      </Typography>
                    </Box>
                  </Box>
                ) : (
                  <Alert severity="info">
                    No FYERS funds snapshot yet. Run Sync Funds from this account card.
                  </Alert>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WarningAmberRounded sx={{ color: 'warning.main', fontSize: 20 }} />
                  <Typography variant="body2" color="text.secondary">
                    Suggested adjustments affect the ledger only after you confirm them. Rejecting leaves balances unchanged.
                  </Typography>
                </Box>

                {pendingData?.transactions?.length ? (
                  pendingData.transactions.map((tx: any) => (
                    <Box
                      key={tx.id}
                      sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        justifyContent: 'space-between',
                        gap: 1.5,
                        p: 1.5,
                        border: 1,
                        borderColor: 'warning.main',
                        borderRadius: 1.5,
                        bgcolor: 'rgba(245, 158, 11, 0.05)',
                      }}
                    >
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Suggested {tx.type} • {formatCurrency(tx.amount, tx.currency)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          {tx.notes}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Detected {new Date(tx.date).toLocaleString()}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<CheckCircleRounded sx={{ fontSize: 16 }} />}
                          disabled={confirmPendingMutation.isPending || rejectPendingMutation.isPending}
                          onClick={() =>
                            confirmPendingMutation.mutate({
                              accountId: selectedAccountForPending.id,
                              txId: tx.id,
                            })
                          }
                        >
                          Confirm
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<CancelRounded sx={{ fontSize: 16 }} />}
                          disabled={confirmPendingMutation.isPending || rejectPendingMutation.isPending}
                          onClick={() =>
                            rejectPendingMutation.mutate({
                              accountId: selectedAccountForPending.id,
                              txId: tx.id,
                            })
                          }
                        >
                          Reject
                        </Button>
                      </Box>
                    </Box>
                  ))
                ) : (
                  <Alert severity="success">
                    No pending reconciliation adjustments for this account.
                  </Alert>
                )}
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setIsPendingModalOpen(false)} color="inherit">Close</Button>
            <Button
              variant="outlined"
              startIcon={<CloudSyncRounded />}
              disabled={!isFyersConnected || syncFundsMutation.isPending}
              onClick={() => syncFundsMutation.mutate(selectedAccountForPending.id)}
            >
              {syncFundsMutation.isPending ? 'Syncing...' : 'Refresh Broker Funds'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
