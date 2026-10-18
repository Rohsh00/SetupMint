import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  Tooltip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  AutoAwesomeRounded,
  BookmarkAddRounded,
  DeleteOutlineRounded,
  RestartAltRounded,
  LayersRounded,
  CloseRounded,
  CheckRounded,
  StarRounded,
  StarBorderRounded,
} from '@mui/icons-material';
import { ITradeTemplate, TemplateGroup, SlRuleType, AssetClass } from '@tradevault/shared';
import { api } from '../../../lib/api.js';
import { toast } from '../../../context/ToastContext.js';

interface TradeTemplateSelectorProps {
  onSelectTemplate: (template: ITradeTemplate) => void;
  onResetDefaults: () => void;
  getCurrentFormStateForTemplate: () => {
    assetClass?: AssetClass;
    direction?: 'LONG' | 'SHORT';
    strategyName?: string;
    entryPrice?: number;
    initialStopLoss?: number;
    plannedTarget?: number;
    plannedRR?: number;
    tags?: string[];
    confluences?: string[];
  };
}

export function TradeTemplateSelector({
  onSelectTemplate,
  onResetDefaults,
  getCurrentFormStateForTemplate,
}: TradeTemplateSelectorProps) {
  const queryClient = useQueryClient();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Save Modal state
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateGroup, setTemplateGroup] = useState<TemplateGroup>('CUSTOM');
  const [slType, setSlType] = useState<SlRuleType>('PERCENT');
  const [slValue, setSlValue] = useState<number>(0.5);
  const [manualHint, setManualHint] = useState('');

  // Fetch templates from API
  const { data: templates = [], isLoading } = useQuery<ITradeTemplate[]>({
    queryKey: ['templates'],
    queryFn: () => api.templates.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) => api.templates.create(payload),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success(`Template '${data?.name || templateName}' saved successfully!`);
      setIsSaveModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save trade template');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Custom template deleted');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to delete template');
    },
  });

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleApply = (tpl: ITradeTemplate) => {
    onSelectTemplate(tpl);
    handleCloseMenu();
  };

  const handleOpenSaveDialog = () => {
    handleCloseMenu();
    const curr = getCurrentFormStateForTemplate();

    setTemplateName(curr.strategyName ? `${curr.strategyName} Setup` : 'Custom Market Setup');
    setTemplateDesc('');

    // Infer group from asset class
    if (curr.assetClass === 'OPTIONS' || curr.assetClass === 'FUTURES') {
      setTemplateGroup('FNO');
    } else if (curr.assetClass === 'EQUITY') {
      setTemplateGroup('STOCKS');
    } else if (curr.assetClass === 'FOREX') {
      setTemplateGroup('FOREX_GOLD');
    } else if (curr.assetClass === 'CRYPTO') {
      setTemplateGroup('CRYPTO');
    } else if (curr.assetClass === 'COMMODITY') {
      setTemplateGroup('MCX');
    } else {
      setTemplateGroup('CUSTOM');
    }

    // Infer SL rule from prices if provided
    if (curr.entryPrice && curr.initialStopLoss && curr.entryPrice > 0) {
      const dist = Math.abs(curr.entryPrice - curr.initialStopLoss);
      const pct = Number(((dist / curr.entryPrice) * 100).toFixed(2));
      setSlType('PERCENT');
      setSlValue(pct > 0 ? pct : 0.5);
    } else {
      setSlType('MANUAL');
      setManualHint('Determined at entry time');
    }

    setIsSaveModalOpen(true);
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;

    const curr = getCurrentFormStateForTemplate();

    const payload = {
      name: templateName.trim(),
      description: templateDesc.trim() || 'Custom user trading setup template',
      group: templateGroup,
      markets: [curr.assetClass || 'FUTURES'],
      direction: curr.direction,
      strategyName: curr.strategyName || undefined,
      slRule: {
        type: slType,
        value: slType === 'MANUAL' ? undefined : Number(slValue) || 0.5,
        manualHint: slType === 'MANUAL' ? manualHint || 'Check technical level' : undefined,
      },
      minRR: curr.plannedRR && curr.plannedRR > 0 ? Number(curr.plannedRR.toFixed(2)) : 1.5,
      titlePattern: `{symbol} ${curr.strategyName || 'Setup'} {direction}`,
      tags: curr.tags || [],
      confluences: curr.confluences || [],
    };

    saveMutation.mutate(payload);
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMutation.mutate(id);
  };

  const customList = templates.filter((t) => !t.isBuiltIn);
  const builtInList = templates.filter((t) => t.isBuiltIn);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        startIcon={<AutoAwesomeRounded sx={{ color: 'primary.main', fontSize: 16 }} />}
        onClick={handleOpenMenu}
        sx={{
          borderRadius: 2,
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'none',
          py: 0.5,
          px: 1.5,
          color: 'text.secondary',
        }}
      >
        Setup Templates
      </Button>

      {/* Templates Dropdown Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        slotProps={{
          paper: {
            sx: {
              width: 340,
              maxHeight: 480,
              borderRadius: 2,
              p: 0.5,
              backgroundImage: 'none',
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
            Market Setup Templates
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Select an institutional setup or save current parameters
          </Typography>
        </Box>

        <Divider sx={{ my: 0.5 }} />

        {/* Save Current Trade Action */}
        <MenuItem onClick={handleOpenSaveDialog} sx={{ py: 1, borderRadius: 1.5, mx: 0.5 }}>
          <ListItemIcon>
            <BookmarkAddRounded sx={{ fontSize: 18, color: 'primary.main' }} />
          </ListItemIcon>
          <ListItemText
            primary={<Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>Save Current Trade as Template</Typography>}
            secondary={<Typography variant="caption" color="text.secondary">Stores rules, R:R, & tags without fixed prices</Typography>}
          />
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        {/* Custom Presets */}
        {customList.length > 0 && (
          <>
            <Typography
              variant="caption"
              sx={{ px: 2, py: 0.5, color: 'text.secondary', fontWeight: 700, fontSize: '0.625rem', letterSpacing: '0.05em', display: 'block' }}
            >
              MY CUSTOM TEMPLATES ({customList.length})
            </Typography>
            {customList.map((t) => (
              <MenuItem
                key={t.id}
                onClick={() => handleApply(t)}
                sx={{
                  borderRadius: 1.5,
                  mx: 0.5,
                  my: 0.25,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Box sx={{ minWidth: 0, pr: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }} noWrap>
                    {t.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {t.group} • {t.slRule.type === 'PERCENT' ? `${t.slRule.value}% SL` : t.slRule.type}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => handleDeleteTemplate(t.id, e)}
                  sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                >
                  <DeleteOutlineRounded sx={{ fontSize: 16 }} />
                </IconButton>
              </MenuItem>
            ))}
            <Divider sx={{ my: 0.5 }} />
          </>
        )}

        {/* Built-in Presets */}
        <Typography
          variant="caption"
          sx={{ px: 2, py: 0.5, color: 'text.secondary', fontWeight: 700, fontSize: '0.625rem', letterSpacing: '0.05em', display: 'block' }}
        >
          BUILT-IN SETUPS ({builtInList.length})
        </Typography>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          builtInList.slice(0, 8).map((t) => (
            <MenuItem
              key={t.id}
              onClick={() => handleApply(t)}
              sx={{
                borderRadius: 1.5,
                mx: 0.5,
                my: 0.25,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                  {t.name}
                </Typography>
                <Chip
                  label={t.group}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem' }} noWrap>
                {t.description}
              </Typography>
            </MenuItem>
          ))
        )}

        <Divider sx={{ my: 0.5 }} />

        {/* Reset to defaults */}
        <MenuItem
          onClick={() => {
            onResetDefaults();
            handleCloseMenu();
          }}
          sx={{ py: 1, borderRadius: 1.5, mx: 0.5 }}
        >
          <ListItemIcon>
            <RestartAltRounded sx={{ fontSize: 18, color: 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText primary={<Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>Reset to Standard Defaults</Typography>} />
        </MenuItem>
      </Menu>

      {/* Save Template Modal */}
      <Dialog
        open={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 2, backgroundImage: 'none' } },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Save Setup Template</Typography>
            <Typography variant="caption" color="text.secondary">
              Save rules, risk ratio, & confluences across symbols
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setIsSaveModalOpen(false)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleSaveSubmit}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Template Name *"
              size="small"
              required
              fullWidth
              autoFocus
              placeholder="e.g. London Open Breakout Long"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />

            <TextField
              label="Description (Optional)"
              size="small"
              fullWidth
              placeholder="e.g. Asian range breakout retest with volume spike"
              value={templateDesc}
              onChange={(e) => setTemplateDesc(e.target.value)}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Category / Group</InputLabel>
                <Select
                  value={templateGroup}
                  label="Category / Group"
                  onChange={(e) => setTemplateGroup(e.target.value as TemplateGroup)}
                >
                  <MenuItem value="FNO">F&O (Futures & Options)</MenuItem>
                  <MenuItem value="STOCKS">Stocks / Equities</MenuItem>
                  <MenuItem value="FOREX_GOLD">Forex & Gold</MenuItem>
                  <MenuItem value="CRYPTO">Crypto</MenuItem>
                  <MenuItem value="MCX">MCX Commodities</MenuItem>
                  <MenuItem value="PRICE_ACTION">Price Action / SMC</MenuItem>
                  <MenuItem value="CUSTOM">Custom</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>SL Rule Type</InputLabel>
                <Select
                  value={slType}
                  label="SL Rule Type"
                  onChange={(e) => setSlType(e.target.value as SlRuleType)}
                >
                  <MenuItem value="PERCENT">Percent (%)</MenuItem>
                  <MenuItem value="POINTS">Points (Fixed)</MenuItem>
                  <MenuItem value="PREMIUM_PERCENT">Option Premium %</MenuItem>
                  <MenuItem value="MANUAL">Manual Technical</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {slType !== 'MANUAL' ? (
              <TextField
                label={slType === 'PERCENT' ? 'Stop Loss Percentage (%)' : 'Stop Loss Points'}
                type="number"
                size="small"
                fullWidth
                value={slValue}
                onChange={(e) => setSlValue(Number(e.target.value) || 0)}
                slotProps={{ htmlInput: { step: 'any' } }}
              />
            ) : (
              <TextField
                label="Manual Stop Loss Hint"
                size="small"
                fullWidth
                placeholder="e.g. Below 15m swing low or VWAP band"
                value={manualHint}
                onChange={(e) => setManualHint(e.target.value)}
              />
            )}

            <Typography variant="caption" color="text.secondary">
              Strict Rule: Real symbol names (e.g. NIFTY) and trade execution prices are never saved in templates. The template adapts cleanly to any instrument you pick.
            </Typography>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setIsSaveModalOpen(false)} color="inherit" disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={saveMutation.isPending}
              startIcon={saveMutation.isPending ? <CircularProgress size={16} /> : <CheckRounded />}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Template'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
