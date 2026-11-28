import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  Chip,
  IconButton,
  Divider,
} from '@mui/material';
import { useTheme as useMuiTheme, alpha } from '@mui/material/styles';

// Icons
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';

import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { IOcrStatementParseResult } from '@tradevault/shared';

export interface AiStatementImportModalProps {
  open: boolean;
  onClose: () => void;
  targetAccountId?: string;
  onImportComplete?: () => void;
}

export function AiStatementImportModal({
  open,
  onClose,
  targetAccountId,
  onImportComplete,
}: AiStatementImportModalProps) {
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const queryClient = useQueryClient();

  const [brokerHint, setBrokerHint] = useState<string>('AUTO');
  const [pastedText, setPastedText] = useState<string>('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<IOcrStatementParseResult | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Mutation to parse statement via AI
  const parseMutation = useMutation({
    mutationFn: async () => {
      const res = await api.ai.parseStatement({
        textContent: pastedText.trim() || undefined,
        imageBase64: imageBase64 || undefined,
        brokerHint: brokerHint !== 'AUTO' ? brokerHint : undefined,
      });
      return res?.data;
    },
    onSuccess: (data) => {
      if (data) {
        setParseResult(data);
        // Select all extracted trades by default
        setSelectedIndices(new Set((data.trades || []).map((_, i) => i)));
        toast.success(`Extracted ${data.totalTradesFound} trades (${data.brokerDetected || 'Broker'})`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to extract statement data');
    },
  });

  // Handle file drop/upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFileName(file.name);
    const reader = new FileReader();

    if (file.type.includes('image') || file.type.includes('pdf')) {
      reader.onload = () => {
        setImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      // Text file
      reader.onload = () => {
        setPastedText(reader.result as string);
      };
      reader.readAsText(file);
    }
  };

  // Toggle selection
  const handleToggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // 1-Click Import of selected trades
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!parseResult || selectedIndices.size === 0) return;
      const tradesToImport = parseResult.trades.filter((_, i) => selectedIndices.has(i));

      // Map to SetupMint trade import structure
      const rows = tradesToImport.map((t) => ({
        symbol: t.symbol,
        direction: t.direction,
        quantity: t.quantity,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice || t.entryPrice,
        entryTime: t.entryTime || new Date().toISOString(),
        exitTime: t.exitTime || new Date().toISOString(),
        broker: parseResult.brokerDetected || 'AI_IMPORT',
        accountId: targetAccountId,
      }));

      return api.exportImport.commitImport({
        broker: parseResult.brokerDetected || 'CUSTOM',
        rows,
        mapping: {},
        accountId: targetAccountId || '',
        importKind: 'TRADES',
        saveMapping: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(`Successfully imported ${selectedIndices.size} trades!`);
      onImportComplete?.();
      handleClose();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to import trades');
    },
  });

  const handleClose = () => {
    setPastedText('');
    setImageBase64(null);
    setImageFileName(null);
    setParseResult(null);
    setSelectedIndices(new Set());
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: alpha(muiTheme.palette.primary.main, 0.15),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: muiTheme.palette.primary.main,
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Multimodal AI Contract Note & Statement Ingestion
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Drop broker PDFs, screenshots, or paste contract note text for instant trade extraction
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={handleClose}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        {!parseResult ? (
          <>
            {/* Broker selector */}
            <FormControl size="small" sx={{ width: 220 }}>
              <InputLabel>Broker Format</InputLabel>
              <Select value={brokerHint} label="Broker Format" onChange={(e) => setBrokerHint(e.target.value)}>
                <MenuItem value="AUTO">Auto-Detect Broker</MenuItem>
                <MenuItem value="ZERODHA">Zerodha (Kite)</MenuItem>
                <MenuItem value="ANGEL_ONE">Angel One (SmartAPI)</MenuItem>
                <MenuItem value="GROWW">Groww</MenuItem>
                <MenuItem value="FYERS">FYERS</MenuItem>
                <MenuItem value="UPSTOX">Upstox</MenuItem>
                <MenuItem value="MT5">MetaTrader 5 (MT5)</MenuItem>
              </Select>
            </FormControl>

            {/* Upload Area */}
            <Box
              sx={{
                p: 3,
                borderRadius: 2.5,
                border: `2px dashed ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                textAlign: 'center',
                bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                cursor: 'pointer',
                '&:hover': {
                  borderColor: muiTheme.palette.primary.main,
                  bgcolor: alpha(muiTheme.palette.primary.main, 0.04),
                },
              }}
              component="label"
            >
              <input type="file" hidden accept="image/*,.pdf,.txt,.csv" onChange={handleFileUpload} />
              <UploadFileRoundedIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {imageFileName ? `Selected: ${imageFileName}` : 'Click or Drag & Drop Contract Note (PDF / Image)'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Supports Zerodha, Angel One, Groww contract notes and trading terminal screenshots
              </Typography>
            </Box>

            <Divider>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                OR PASTE TEXT BELOW
              </Typography>
            </Divider>

            <TextField
              multiline
              rows={5}
              placeholder="Paste raw contract note lines or trade confirmation text here..."
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                },
              }}
            />
          </>
        ) : (
          /* Preview extracted trades */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Extracted {parseResult.totalTradesFound} Executions ({parseResult.brokerDetected})
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Model: {parseResult.modelUsed || 'AI Vision Engine'} | Confidence: {Math.round((parseResult.confidenceScore || 0.8) * 100)}%
                </Typography>
              </Box>
              <Button size="small" variant="text" onClick={() => setParseResult(null)} sx={{ textTransform: 'none' }}>
                Upload Different File
              </Button>
            </Box>

            <Paper variant="outlined" sx={{ maxHeight: 320, overflowY: 'auto', borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selectedIndices.size > 0 && selectedIndices.size < parseResult.trades.length}
                        checked={selectedIndices.size === parseResult.trades.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIndices(new Set(parseResult.trades.map((_, i) => i)));
                          else setSelectedIndices(new Set());
                        }}
                      />
                    </TableCell>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Entry Price</TableCell>
                    <TableCell align="right">Exit Price</TableCell>
                    <TableCell align="right">Net P&L</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parseResult.trades.map((t, idx) => {
                    const isSelected = selectedIndices.has(idx);
                    const isWin = (t.netPnL || 0) > 0;
                    return (
                      <TableRow key={idx} hover selected={isSelected} onClick={() => handleToggleSelect(idx)} sx={{ cursor: 'pointer' }}>
                        <TableCell padding="checkbox">
                          <Checkbox checked={isSelected} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{t.symbol}</TableCell>
                        <TableCell>
                          <Chip
                            label={t.direction}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              bgcolor: t.direction === 'LONG' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: t.direction === 'LONG' ? '#10b981' : '#ef4444',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">{t.quantity}</TableCell>
                        <TableCell align="right">{t.entryPrice?.toFixed(2)}</TableCell>
                        <TableCell align="right">{t.exitPrice ? t.exitPrice.toFixed(2) : '—'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: isWin ? '#10b981' : (t.netPnL || 0) < 0 ? '#ef4444' : 'text.primary' }}>
                          {t.netPnL !== undefined ? t.netPnL.toFixed(2) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        {!parseResult ? (
          <Button
            variant="contained"
            color="primary"
            onClick={() => parseMutation.mutate()}
            disabled={(!pastedText.trim() && !imageBase64) || parseMutation.isPending}
            startIcon={parseMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeRoundedIcon />}
            sx={{ textTransform: 'none', fontWeight: 600, px: 2.5 }}
          >
            {parseMutation.isPending ? 'Extracting with AI...' : 'Extract Trades with AI'}
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            onClick={() => importMutation.mutate()}
            disabled={selectedIndices.size === 0 || importMutation.isPending}
            startIcon={importMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRoundedIcon />}
            sx={{ textTransform: 'none', fontWeight: 600, px: 2.5 }}
          >
            {importMutation.isPending ? 'Importing...' : `Import ${selectedIndices.size} Selected Trades`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

