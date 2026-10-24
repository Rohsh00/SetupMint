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
} from '@mui/material';
import {
  AccountBalanceWalletRounded,
  AddRounded,
  SouthWestRounded,
  NorthEastRounded,
  PaidRounded,
  SyncRounded,
  CloseRounded,
  BusinessRounded,
  TrendingUpRounded,
  LinkRounded,
  LinkOffRounded,
  FactCheckRounded,
  CloudSyncRounded,
  CheckCircleRounded,
  CancelRounded,
  WarningAmberRounded,
} from '@mui/icons-material';
import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { formatCurrency } from '../lib/utils.js';

export function AccountsPage() {
  const muiTheme = useTheme();
  const queryClient = useQueryClient();
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
  const [baseCurrency, setBaseCurrency] = useState('INR');
  const [initialBalance, setInitialBalance] = useState<number>(100000);

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
      const brokerBal = result?.brokerBalance != null ? Number(result.brokerBalance).toLocaleString() : '';
      if (result?.suggestionCreated) {
        const account = accounts.find((a: any) => a.id === accountId);
        if (account) {
          setSelectedAccountForPending(account);
          setIsPendingModalOpen(true);
        }
        toast.info(`FYERS live balance fetched (₹${brokerBal}). Review the suggested adjustment.`);
      } else if (result?.skipReason === 'WITHIN_TOLERANCE') {
        toast.success(`FYERS live balance updated: ₹${brokerBal}. Balances are in sync.`);
      } else if (result?.skipReason === 'OPEN_OR_PLANNED_TRADES') {
        toast.info(`FYERS live balance updated: ₹${brokerBal}. Suggestions paused during open trades.`);
      } else if (result?.skipReason === 'PENDING_REVIEW_EXISTS') {
        toast.info(`FYERS live balance updated: ₹${brokerBal}. Reconciliation suggestion already awaiting review.`);
      } else {
        toast.success(`FYERS live balance updated: ₹${brokerBal}.`);
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
    createAccountMutation.mutate({
      name,
      broker,
      accountNumber,
      accountType,
      baseCurrency,
      initialBalance: Number(initialBalance) || 0,
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

  const totalConsolidatedEquity = accounts.reduce((sum: number, a: any) => sum + (a.currentBalance || 0), 0);
  const totalConsolidatedPnL = accounts.reduce((sum: number, a: any) => sum + (a.realizedPnL || 0), 0);

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
          <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountBalanceWalletRounded sx={{ color: 'primary.main', fontSize: 28 }} />
            Trading Accounts & Cash Flow
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage brokerage sub-accounts, cash deposits, withdrawals, and consolidated portfolio balances
          </Typography>
        </Box>

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

      {/* Portfolio Totals Strip */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card variant="outlined" sx={{ bgcolor: 'background.paper', p: 1 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', mb: 0.5 }}>
                Consolidated Portfolio Equity
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: '"JetBrains Mono", monospace' }}>
                {formatCurrency(totalConsolidatedEquity)}
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
                  color: totalConsolidatedPnL >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                }}
              >
                {formatCurrency(totalConsolidatedPnL)}
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
                {accounts.length}
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
          accounts.map((acc: any) => {
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

                      {String(acc.broker || '').toUpperCase() === 'FYERS' && (
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
                onChange={(e) => setAccountType(e.target.value)}
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
                label="Base Currency"
                size="small"
                fullWidth
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
              >
                <MenuItem value="INR">INR (₹)</MenuItem>
                <MenuItem value="USD">USD ($)</MenuItem>
                <MenuItem value="EUR">EUR (€)</MenuItem>
                <MenuItem value="GBP">GBP (£)</MenuItem>
                <MenuItem value="AED">AED</MenuItem>
              </TextField>
            </Box>

            <TextField
              label="Starting Initial Balance *"
              type="number"
              size="small"
              required
              fullWidth
              value={initialBalance}
              onChange={(e) => setInitialBalance(Number(e.target.value))}
              slotProps={{ htmlInput: { min: 0, step: 'any', style: { fontFamily: '"JetBrains Mono", monospace' } } }}
            />
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
