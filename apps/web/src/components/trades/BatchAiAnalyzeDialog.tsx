import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Alert from '@mui/material/Alert';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';

import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { IBatchAiAnalyzeResult } from '@tradevault/shared';

interface BatchAiAnalyzeDialogProps {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  onComplete?: () => void;
}

export function BatchAiAnalyzeDialog({
  open,
  onClose,
  selectedIds,
  onComplete,
}: BatchAiAnalyzeDialogProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const queryClient = useQueryClient();

  const [autoApply, setAutoApply] = useState(true);
  const [force, setForce] = useState(true);
  const [batchResult, setBatchResult] = useState<IBatchAiAnalyzeResult | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: () =>
      api.trades.bulkAiAnalyze({
        tradeIds: selectedIds,
        autoApply,
        force,
      }),
    onSuccess: (res: any) => {
      const data = res.data as IBatchAiAnalyzeResult;
      setBatchResult(data);
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success(`Batch AI Analysis complete: ${data.succeeded} trades analyzed!`);
      onComplete?.();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Batch AI analysis failed');
    },
  });

  const handleClose = () => {
    if (analyzeMutation.isPending) return;
    setBatchResult(null);
    onClose();
  };

  const handleStart = () => {
    setBatchResult(null);
    analyzeMutation.mutate();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pb: 1 }}>
        <AutoAwesomeRoundedIcon sx={{ color: '#6366f1', fontSize: 24 }} />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Batch AI Copilot Analysis
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
        {!batchResult && !analyzeMutation.isPending && (
          <>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Targeting <b>{selectedIds.length} trade{selectedIds.length > 1 ? 's' : ''}</b> for deep AI candlestick price action perception, setup categorization, and discipline audit.
            </Alert>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', p: 2, borderRadius: 2 }}>
              <FormControlLabel
                control={<Switch checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} color="primary" />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Auto-Populate Trade Journal
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Automatically write detected setup type, thesis, confluences, mistakes, and lessons learned into trades
                    </Typography>
                  </Box>
                }
              />

              <FormControlLabel
                control={<Switch checked={force} onChange={(e) => setForce(e.target.checked)} color="primary" />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Force Re-Analyze Existing Trades
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Re-run AI analysis even if trade was previously analyzed
                    </Typography>
                  </Box>
                }
              />
            </Box>
          </>
        )}

        {analyzeMutation.isPending && (
          <Box sx={{ py: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <LinearProgress sx={{ width: '100%', borderRadius: 1.5, height: 6 }} />
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Running Multimodal AI Analysis on {selectedIds.length} trades...
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Evaluating candlestick price sequences, excursion efficiency, and mistake detection
              </Typography>
            </Box>
          </Box>
        )}

        {batchResult && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, bgcolor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleRoundedIcon sx={{ color: '#10b981' }} />
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#10b981' }}>
                  Analysis Complete: {batchResult.succeeded} of {batchResult.totalRequested} trades analyzed
                </Typography>
              </Box>
              {batchResult.failed > 0 && (
                <Chip size="small" label={`${batchResult.failed} failed`} sx={{ bgcolor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 700 }} />
              )}
            </Box>

            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary' }}>
              Analyzed Trades Summary
            </Typography>

            <List dense sx={{ maxHeight: 220, overflowY: 'auto', bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', borderRadius: 2, p: 0.5 }}>
              {batchResult.analyzedTrades.map((t) => (
                <ListItem key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: `1px solid ${muiTheme.palette.divider}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {t.success ? (
                      <CheckCircleRoundedIcon sx={{ color: '#10b981', fontSize: 16 }} />
                    ) : (
                      <ErrorOutlineRoundedIcon sx={{ color: '#ef4444', fontSize: 16 }} />
                    )}
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {t.symbol} {t.direction || ''}
                    </Typography>
                    {t.setupType && (
                      <Chip size="small" label={t.setupType} sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }} />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {t.executionScore !== undefined && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Exec: <b>{t.executionScore}/100</b>
                      </Typography>
                    )}
                    {t.disciplineScore !== undefined && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Disc: <b>{t.disciplineScore}/5 ★</b>
                      </Typography>
                    )}
                  </Box>
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} disabled={analyzeMutation.isPending} sx={{ textTransform: 'none', fontWeight: 600 }}>
          {batchResult ? 'Done' : 'Cancel'}
        </Button>
        {!batchResult && (
          <Button
            variant="contained"
            onClick={handleStart}
            disabled={analyzeMutation.isPending || selectedIds.length === 0}
            startIcon={<BoltRoundedIcon />}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              bgcolor: '#6366f1',
              '&:hover': { bgcolor: '#4f46e5' },
              borderRadius: 2,
              px: 2.5,
            }}
          >
            {analyzeMutation.isPending ? 'Analyzing...' : `Analyze ${selectedIds.length} Trade${selectedIds.length > 1 ? 's' : ''}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
