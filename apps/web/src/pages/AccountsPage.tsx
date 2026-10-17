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
} from '@mui/icons-material';
import { api } from '../lib/api.js';
import { formatCurrency } from '../lib/utils.js';

export function AccountsPage() {
  const muiTheme = useTheme();
  const queryClient = useQueryClient();
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedAccountForTx, setSelectedAccountForTx] = useState<any>(null);

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

  const createAccountMutation = useMutation({
    mutationFn: (payload: any) => api.accounts.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsAddAccountModalOpen(false);
      setName('');
      setBroker('');
      setAccountNumber('');
    },
  });

  const addTxMutation = useMutation({
    mutationFn: ({ accountId, payload }: { accountId: string; payload: any }) =>
      api.accounts.addTransaction(accountId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsTxModalOpen(false);
      setTxAmount(10000);
      setTxNotes('');
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (accountId: string) => api.accounts.reconcile(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
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

    addTxMutation.mutate({
      accountId: selectedAccountForTx.id,
      payload: {
        type: txType,
        amount: Number(txAmount),
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
                    </Box>
                  </CardContent>

                  <Divider sx={{ my: 0.5 }} />

                  <CardActions sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between' }}>
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
                      Deposit / Withdraw
                    </Button>

                    <Tooltip title="Authoritatively reconcile account balance and P&L from raw execution fills" arrow>
                      <span>
                        <Button
                          size="small"
                          color="inherit"
                          disabled={reconcileMutation.isPending}
                          onClick={() => reconcileMutation.mutate(acc.id)}
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
    </Box>
  );
}
