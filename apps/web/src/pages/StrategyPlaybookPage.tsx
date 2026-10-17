import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import MenuBookIcon from '@mui/icons-material/MenuBookRounded';
import AddIcon from '@mui/icons-material/AddRounded';
import EditIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';

import { api } from '../lib/api.js';
import { formatCurrency, formatPercent } from '../lib/utils.js';

export function StrategyPlaybookPage() {
  const queryClient = useQueryClient();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: strategies = [], isLoading } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => api.strategies.list(),
  });

  // Strategy form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minRiskReward, setMinRiskReward] = useState(1.5);
  const [entryRulesInput, setEntryRulesInput] = useState('');
  const [stopRulesInput, setStopRulesInput] = useState('');
  const [targetRulesInput, setTargetRulesInput] = useState('');
  const [invalidationInput, setInvalidationInput] = useState('');
  const [checklistInput, setChecklistInput] = useState('');

  const openCreateModal = () => {
    setEditingStrategy(null);
    setName('');
    setDescription('');
    setMinRiskReward(1.5);
    setEntryRulesInput('');
    setStopRulesInput('');
    setTargetRulesInput('');
    setInvalidationInput('');
    setChecklistInput('');
    setIsModalOpen(true);
  };

  const openEditModal = (strat: any) => {
    setEditingStrategy(strat);
    setName(strat.name);
    setDescription(strat.description || '');
    setMinRiskReward(strat.minRiskReward || 1.5);
    setEntryRulesInput(strat.entryRules?.join('\n') || '');
    setStopRulesInput(strat.stopLossRules?.join('\n') || '');
    setTargetRulesInput(strat.targetRules?.join('\n') || '');
    setInvalidationInput(strat.invalidationCriteria?.join('\n') || '');
    setChecklistInput(strat.checklist?.join('\n') || '');
    setIsModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingStrategy) {
        return api.strategies.update(editingStrategy.id, payload);
      }
      return api.strategies.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setIsModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.strategies.delete(id),
    onSuccess: () => {
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name,
      description,
      minRiskReward: Number(minRiskReward) || 1.5,
      entryRules: entryRulesInput.split('\n').map((s) => s.trim()).filter(Boolean),
      stopLossRules: stopRulesInput.split('\n').map((s) => s.trim()).filter(Boolean),
      targetRules: targetRulesInput.split('\n').map((s) => s.trim()).filter(Boolean),
      invalidationCriteria: invalidationInput.split('\n').map((s) => s.trim()).filter(Boolean),
      checklist: checklistInput.split('\n').map((s) => s.trim()).filter(Boolean),
      assetClasses: ['EQUITY', 'FUTURES'],
      timeframes: ['5m', '15m'],
      tags: [],
    };
    saveMutation.mutate(payload);
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          pb: 2,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: muiTheme.palette.text.primary }}>
            Strategy Playbook & Setup Repository
          </Typography>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
            Codified rules, invalidation conditions, checklists, and real trade statistical edges
          </Typography>
        </Box>

        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={openCreateModal}
          startIcon={<AddIcon />}
          sx={{ fontWeight: 700, px: 2 }}
        >
          New Setup
        </Button>
      </Box>

      {/* Strategies Grid */}
      {isLoading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <CircularProgress size={32} />
        </Box>
      ) : strategies.length === 0 ? (
        <Card sx={{ p: 6, textAlign: 'center', borderStyle: 'dashed' }}>
          <MenuBookIcon sx={{ fontSize: 48, color: muiTheme.palette.text.secondary, mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            No Strategies in Playbook
          </Typography>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, maxWidth: 440, mx: 'auto', mt: 0.5, mb: 2.5 }}>
            Codify your trading edge into concrete setups with strict entry rules, invalidation levels, and checklists.
          </Typography>
          <Button variant="contained" color="primary" onClick={openCreateModal} startIcon={<AddIcon />}>
            Create First Strategy
          </Button>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {strategies.map((strat: any) => {
            const isProfitable = (strat.netPnL || 0) >= 0;

            return (
              <Grid key={strat.id} size={{ xs: 12, md: 6, lg: 4 }}>
                <Card
                  sx={{
                    p: 2.5,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 2,
                    '&:hover': {
                      borderColor: muiTheme.palette.primary.main,
                    },
                  }}
                >
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', color: muiTheme.palette.text.primary }}>
                        {strat.name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title="Edit Strategy" arrow>
                          <IconButton size="small" onClick={() => openEditModal(strat)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Strategy" arrow>
                          <IconButton size="small" onClick={() => setDeleteConfirmId(strat.id)} sx={{ color: muiTheme.palette.error.main }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', mt: 0.5 }}>
                      {strat.description || 'No description provided.'}
                    </Typography>

                    {/* Performance strip */}
                    <Grid container spacing={1.5} sx={{ mt: 2, p: 1.5, borderRadius: 2, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)', border: `1px solid ${muiTheme.palette.divider}` }}>
                      <Grid size={{ xs: 4 }}>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Net P&L</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: isProfitable ? muiTheme.palette.profit.main : muiTheme.palette.loss.main }}>
                          {formatCurrency(strat.netPnL)}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Win Rate</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                          {formatPercent(strat.winRate)}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>Trades</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                          {strat.totalTrades || 0}
                        </Typography>
                      </Grid>
                    </Grid>

                    {/* Rules preview */}
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: muiTheme.palette.text.secondary, display: 'block', mb: 1 }}>
                        Key Entry Criteria
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {strat.entryRules?.slice(0, 3).map((rule: string, i: number) => (
                          <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            <CheckCircleOutlineIcon fontSize="small" sx={{ color: muiTheme.palette.primary.main, fontSize: 16, mt: 0.25 }} />
                            <Typography variant="caption" noWrap sx={{ color: muiTheme.palette.text.secondary }}>
                              {rule}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ pt: 1.5, borderTop: `1px solid ${muiTheme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: muiTheme.palette.text.secondary }}>
                    <span>Min R:R: <strong>{strat.minRiskReward || 1.5}:1</strong></span>
                    <span>{strat.checklist?.length || 0} checklist rules</span>
                  </Box>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Create / Edit Strategy Dialog */}
      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {editingStrategy ? 'Edit Strategy Setup' : 'Create Playbook Setup'}
            </Typography>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Formalize setup rules, invalidation conditions, and checklists
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setIsModalOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 8 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Strategy Name
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Morning Opening Range Breakout (ORB)"
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Minimum R:R Target
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  size="small"
                  value={minRiskReward}
                  onChange={(e) => setMinRiskReward(Number(e.target.value))}
                  slotProps={{ htmlInput: { step: '0.1' } }}
                />
              </Grid>
            </Grid>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                Setup Description & Edge Hypothesis
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={2}
                size="small"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="High-probability setup context, market conditions, and timeframes"
              />
            </Box>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Entry Rules (One per line)
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  size="small"
                  value={entryRulesInput}
                  onChange={(e) => setEntryRulesInput(e.target.value)}
                  placeholder="15m candle closes above VWAP&#10;Volume > 1.5x 20-period average"
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                  Stop Loss & Invalidation Rules (One per line)
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  size="small"
                  value={stopRulesInput}
                  onChange={(e) => setStopRulesInput(e.target.value)}
                  placeholder="Close below previous swing low&#10;Invalidate if VWAP broken on 5m"
                />
              </Grid>
            </Grid>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                Pre-Execution Checklist Items (One per line)
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                size="small"
                value={checklistInput}
                onChange={(e) => setChecklistInput(e.target.value)}
                placeholder="Check high-impact economic news releases&#10;Verify position sizing within 1% risk budget"
              />
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
            <Button variant="outlined" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : editingStrategy ? 'Update Strategy' : 'Save Strategy'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteConfirmId)}
        onClose={() => setDeleteConfirmId(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Strategy Setup</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
            Are you sure you want to delete this strategy setup from your playbook? Historical trades will remain intact.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
