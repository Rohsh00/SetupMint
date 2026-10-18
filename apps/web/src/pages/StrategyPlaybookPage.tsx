import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import MenuBookIcon from '@mui/icons-material/MenuBookRounded';
import AddIcon from '@mui/icons-material/AddRounded';
import EditIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import LayersIcon from '@mui/icons-material/LayersRounded';
import StarIcon from '@mui/icons-material/StarRounded';
import StarBorderIcon from '@mui/icons-material/StarBorderRounded';
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded';
import CheckIcon from '@mui/icons-material/CheckRounded';

import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { formatCurrency, formatPercent } from '../lib/utils.js';
import {
  ITradeTemplate,
  TemplateGroup,
  SlRuleType,
  AssetClass,
} from '@tradevault/shared';

export function StrategyPlaybookPage() {
  const queryClient = useQueryClient();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'templates' ? 'TEMPLATES' : 'STRATEGIES';

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    if (newValue === 'TEMPLATES') {
      setSearchParams({ tab: 'templates' });
    } else {
      setSearchParams({});
    }
  };

  // Strategy modal & queries
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: strategies = [], isLoading: isLoadingStrategies } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => api.strategies.list(),
  });

  // Templates query
  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery<ITradeTemplate[]>({
    queryKey: ['templates'],
    queryFn: () => api.templates.list(),
  });

  // Template category filter & search
  const [templateFilter, setTemplateFilter] = useState<string>('ALL');
  const [templateSearch, setTemplateSearch] = useState<string>('');

  // Template creation dialog state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplGroup, setTplGroup] = useState<TemplateGroup>('CUSTOM');
  const [tplMarkets, setTplMarkets] = useState<AssetClass[]>(['EQUITY', 'OPTIONS']);
  const [tplDirection, setTplDirection] = useState<'LONG' | 'SHORT' | ''>('');
  const [tplStrategyName, setTplStrategyName] = useState('');
  const [tplSlType, setTplSlType] = useState<SlRuleType>('PERCENT');
  const [tplSlValue, setTplSlValue] = useState<number>(0.5);
  const [tplManualHint, setTplManualHint] = useState('');
  const [tplMinRR, setTplMinRR] = useState<number>(1.5);
  const [tplTitlePattern, setTplTitlePattern] = useState('{symbol} Setup {direction}');
  const [tplTagsInput, setTplTagsInput] = useState('');
  const [tplConfluencesInput, setTplConfluencesInput] = useState('');
  const [templateDeleteConfirmId, setTemplateDeleteConfirmId] = useState<string | null>(null);

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
    setSaveError(null);
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
    setSaveError(null);
    setIsModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingStrategy) {
        const stratId = editingStrategy.id || editingStrategy._id;
        return api.strategies.update(stratId, payload);
      }
      return api.strategies.create(payload);
    },
    onSuccess: () => {
      setSaveError(null);
      toast.success(editingStrategy ? 'Strategy setup updated successfully.' : 'Strategy setup saved to playbook.');
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      setIsModalOpen(false);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to save strategy setup';
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.strategies.delete(id),
    onSuccess: () => {
      setDeleteConfirmId(null);
      setDeleteError(null);
      toast.success('Strategy setup deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to delete strategy setup';
      setDeleteError(msg);
      toast.error(msg);
    },
  });

  // Template Mutations
  const saveTemplateMutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingTemplate) {
        return api.templates.update(editingTemplate.id, payload);
      }
      return api.templates.create(payload);
    },
    onSuccess: () => {
      toast.success(editingTemplate ? 'Template updated!' : 'Custom setup template created!');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setIsTemplateModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save setup template');
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.templates.delete(id),
    onSuccess: () => {
      toast.success('Template deleted');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setTemplateDeleteConfirmId(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to delete template');
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: (id: string) => api.templates.toggleFavorite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const openCreateTemplateModal = () => {
    setEditingTemplate(null);
    setTplName('');
    setTplDesc('');
    setTplGroup('CUSTOM');
    setTplMarkets(['EQUITY', 'OPTIONS']);
    setTplDirection('');
    setTplStrategyName('');
    setTplSlType('PERCENT');
    setTplSlValue(0.5);
    setTplManualHint('');
    setTplMinRR(1.5);
    setTplTitlePattern('{symbol} Setup {direction}');
    setTplTagsInput('');
    setTplConfluencesInput('');
    setIsTemplateModalOpen(true);
  };

  const openEditTemplateModal = (t: ITradeTemplate) => {
    setEditingTemplate(t);
    setTplName(t.name);
    setTplDesc(t.description || '');
    setTplGroup(t.group);
    setTplMarkets(t.markets || ['EQUITY']);
    setTplDirection(t.direction || '');
    setTplStrategyName(t.strategyName || '');
    setTplSlType(t.slRule.type);
    setTplSlValue(t.slRule.value || 0.5);
    setTplManualHint(t.slRule.manualHint || '');
    setTplMinRR(t.minRR || 1.5);
    setTplTitlePattern(t.titlePattern || '{symbol} Setup');
    setTplTagsInput(t.tags?.join(', ') || '');
    setTplConfluencesInput(t.confluences?.join(', ') || '');
    setIsTemplateModalOpen(true);
  };

  const handleTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim()) {
      toast.warning('Please enter a template name.');
      return;
    }

    const payload = {
      name: tplName.trim(),
      description: tplDesc.trim(),
      group: tplGroup,
      markets: tplMarkets.length > 0 ? tplMarkets : ['EQUITY'],
      direction: tplDirection || undefined,
      strategyName: tplStrategyName.trim() || undefined,
      slRule: {
        type: tplSlType,
        value: tplSlType === 'MANUAL' ? undefined : Number(tplSlValue) || 0.5,
        manualHint: tplSlType === 'MANUAL' ? tplManualHint.trim() || 'Defined at trade entry' : undefined,
      },
      minRR: Number(tplMinRR) || 1.5,
      titlePattern: tplTitlePattern.trim() || '{symbol} Setup',
      tags: tplTagsInput.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      confluences: tplConfluencesInput.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    };

    saveTemplateMutation.mutate(payload);
  };

  const handleStrategySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('Please enter a strategy name.');
      return;
    }
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

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (templateFilter === 'CUSTOM' && t.isBuiltIn) return false;
      if (templateFilter === 'FAVORITES' && !t.isFavorite) return false;
      if (templateFilter !== 'ALL' && templateFilter !== 'CUSTOM' && templateFilter !== 'FAVORITES' && t.group !== templateFilter) {
        return false;
      }
      if (templateSearch.trim()) {
        const query = templateSearch.toLowerCase().trim();
        const matchesName = t.name.toLowerCase().includes(query);
        const matchesDesc = t.description?.toLowerCase().includes(query);
        const matchesStrategy = t.strategyName?.toLowerCase().includes(query);
        const matchesTag = t.tags?.some((tag) => tag.toLowerCase().includes(query));
        return matchesName || matchesDesc || matchesStrategy || matchesTag;
      }
      return true;
    });
  }, [templates, templateFilter, templateSearch]);

  const groupBadgeColor = (group: TemplateGroup) => {
    switch (group) {
      case 'FNO':
        return '#8b5cf6';
      case 'STOCKS':
        return '#0284c7';
      case 'FOREX_GOLD':
        return '#eab308';
      case 'CRYPTO':
        return '#f97316';
      case 'MCX':
        return '#d97706';
      case 'PRICE_ACTION':
        return '#10b981';
      default:
        return '#64748b';
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
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
            Strategy Playbook & Trade Setup Templates
          </Typography>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
            Codified execution rules, institutional market setups, and verified trade performance statistics
          </Typography>
        </Box>

        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={activeTab === 'TEMPLATES' ? openCreateTemplateModal : openCreateModal}
          startIcon={<AddIcon />}
          sx={{ fontWeight: 700, px: 2 }}
        >
          {activeTab === 'TEMPLATES' ? 'New Setup Template' : 'New Playbook Setup'}
        </Button>
      </Box>

      {/* Navigation Tabs */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{
          minHeight: 44,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.875rem',
            minHeight: 44,
            gap: 1,
          },
        }}
      >
        <Tab
          value="STRATEGIES"
          label={`Execution Playbooks (${strategies.length})`}
          icon={<MenuBookIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
        />
        <Tab
          value="TEMPLATES"
          label={`Trade Setup Templates (${templates.length})`}
          icon={<LayersIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
        />
      </Tabs>

      {/* ================= TAB 1: STRATEGIES ================= */}
      {activeTab === 'STRATEGIES' && (
        <>
          {isLoadingStrategies ? (
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
                  <Grid key={strat.id || strat._id} size={{ xs: 12, md: 6, lg: 4 }}>
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
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteConfirmId(strat.id || strat._id);
                                }}
                                sx={{ color: muiTheme.palette.error.main }}
                              >
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
                            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', fontSize: '0.6875rem' }}>
                              Trades
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                              {strat.totalTrades || 0}
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 4 }}>
                            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', fontSize: '0.6875rem' }}>
                              Win Rate
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: strat.winRate >= 50 ? 'success.main' : 'text.primary' }}>
                              {formatPercent(strat.winRate || 0)}
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 4 }}>
                            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', fontSize: '0.6875rem' }}>
                              Net P&L
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: isProfitable ? 'success.main' : 'error.main' }}>
                              {formatCurrency(strat.netPnL || 0)}
                            </Typography>
                          </Grid>
                        </Grid>

                        {/* Rules counts */}
                        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          <Chip size="small" variant="outlined" label={`Min R:R 1:${strat.minRiskReward || 1.5}`} sx={{ fontWeight: 600, fontSize: '0.6875rem' }} />
                          <Chip size="small" variant="outlined" label={`${strat.entryRules?.length || 0} Entry Rules`} sx={{ fontSize: '0.6875rem' }} />
                          <Chip size="small" variant="outlined" label={`${strat.stopLossRules?.length || 0} SL Rules`} sx={{ fontSize: '0.6875rem' }} />
                          <Chip size="small" variant="outlined" label={`${strat.invalidationCriteria?.length || 0} Invalidation`} sx={{ fontSize: '0.6875rem' }} />
                        </Box>
                      </Box>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </>
      )}

      {/* ================= TAB 2: TRADE SETUP TEMPLATES ================= */}
      {activeTab === 'TEMPLATES' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Filter Bar */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 2 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {[
                { id: 'ALL', label: 'All Setups' },
                { id: 'FNO', label: 'F&O' },
                { id: 'STOCKS', label: 'Stocks' },
                { id: 'FOREX_GOLD', label: 'Forex & Gold' },
                { id: 'CRYPTO', label: 'Crypto' },
                { id: 'MCX', label: 'MCX' },
                { id: 'PRICE_ACTION', label: 'Price Action / SMC' },
                { id: 'CUSTOM', label: 'Custom' },
              ].map((f) => (
                <Chip
                  key={f.id}
                  label={f.label}
                  clickable
                  onClick={() => setTemplateFilter(f.id)}
                  color={templateFilter === f.id ? 'primary' : 'default'}
                  variant={templateFilter === f.id ? 'filled' : 'outlined'}
                  size="small"
                  sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                />
              ))}
            </Box>

            <TextField
              size="small"
              placeholder="Search templates by setup, tag, or strategy..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              sx={{ minWidth: { md: 280 } }}
            />
          </Box>

          {/* Templates Grid */}
          {isLoadingTemplates ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <CircularProgress size={32} />
            </Box>
          ) : filteredTemplates.length === 0 ? (
            <Card sx={{ p: 6, textAlign: 'center', borderStyle: 'dashed' }}>
              <LayersIcon sx={{ fontSize: 48, color: muiTheme.palette.text.secondary, mb: 1.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                No Matching Setup Templates
              </Typography>
              <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5, mb: 2 }}>
                Try adjusting your category filter or search query.
              </Typography>
              <Button variant="contained" size="small" onClick={openCreateTemplateModal}>
                Create Custom Setup Template
              </Button>
            </Card>
          ) : (
            <Grid container spacing={2.5}>
              {filteredTemplates.map((tpl) => {
                const perf = tpl.performance || { totalTrades: 0, winTrades: 0, winRate: 0, netPnL: 0, profitFactor: 0 };
                const isNetPositive = (perf.netPnL || 0) >= 0;

                return (
                  <Grid key={tpl.id} size={{ xs: 12, md: 6, lg: 4 }}>
                    <Card
                      sx={{
                        p: 2.5,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        borderRadius: 2.5,
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: groupBadgeColor(tpl.group),
                          boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.06)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {/* Header Badges */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Chip
                              label={tpl.group}
                              size="small"
                              sx={{
                                fontWeight: 800,
                                fontSize: '0.625rem',
                                color: '#fff',
                                backgroundColor: groupBadgeColor(tpl.group),
                                height: 20,
                              }}
                            />
                            {tpl.isBuiltIn ? (
                              <Chip
                                label="Built-in"
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.625rem', fontWeight: 600 }}
                              />
                            ) : (
                              <Chip
                                label="Custom"
                                size="small"
                                color="primary"
                                sx={{ height: 20, fontSize: '0.625rem', fontWeight: 700 }}
                              />
                            )}
                            {tpl.direction && (
                              <Chip
                                label={tpl.direction}
                                size="small"
                                icon={tpl.direction === 'LONG' ? <TrendingUpIcon sx={{ fontSize: 13 }} /> : <TrendingDownIcon sx={{ fontSize: 13 }} />}
                                color={tpl.direction === 'LONG' ? 'success' : 'error'}
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.625rem', fontWeight: 700 }}
                              />
                            )}
                          </Box>

                          {!tpl.isBuiltIn && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Tooltip title={tpl.isFavorite ? 'Unfavorite' : 'Favorite'}>
                                <IconButton
                                  size="small"
                                  onClick={() => toggleFavoriteMutation.mutate(tpl.id)}
                                  sx={{ color: tpl.isFavorite ? 'warning.main' : 'text.disabled' }}
                                >
                                  {tpl.isFavorite ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Edit Custom Template">
                                <IconButton size="small" onClick={() => openEditTemplateModal(tpl)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Template">
                                <IconButton
                                  size="small"
                                  onClick={() => setTemplateDeleteConfirmId(tpl.id)}
                                  sx={{ color: 'error.main' }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        </Box>

                        {/* Title & Description */}
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: '0.9375rem', lineHeight: 1.3 }}>
                            {tpl.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {tpl.description}
                          </Typography>
                        </Box>

                        {/* Rules Ribbon */}
                        <Box
                          sx={{
                            p: 1.5,
                            borderRadius: 2,
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                            border: `1px solid ${muiTheme.palette.divider}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1,
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                              Stop Loss Rule:
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: 'warning.main' }}>
                              {tpl.slRule.type === 'PERCENT'
                                ? `${tpl.slRule.value}% price distance`
                                : tpl.slRule.type === 'POINTS'
                                ? `${tpl.slRule.value} fixed pts`
                                : tpl.slRule.type === 'PREMIUM_PERCENT'
                                ? `${tpl.slRule.value}% premium`
                                : tpl.slRule.manualHint || 'Manual technical'}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                              Minimum Target R:R:
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                              1:{tpl.minRR}
                            </Typography>
                          </Box>
                          {tpl.strategyName && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                Strategy Playbook:
                              </Typography>
                              <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                {tpl.strategyName}
                              </Typography>
                            </Box>
                          )}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                              Title Pattern:
                            </Typography>
                            <Typography variant="caption" sx={{ fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.6875rem' }}>
                              {tpl.titlePattern}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Tags and Confluences */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {tpl.tags?.slice(0, 3).map((tag) => (
                            <Chip key={tag} label={`#${tag}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                          ))}
                          {tpl.confluences?.slice(0, 2).map((c) => (
                            <Chip key={c} label={c} size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 600 }} />
                          ))}
                        </Box>
                      </Box>

                      {/* Performance Metric Strip */}
                      <Box
                        sx={{
                          pt: 1.5,
                          borderTop: `1px solid ${muiTheme.palette.divider}`,
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: 1,
                          textAlign: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem', display: 'block' }}>
                            Trades
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                            {perf.totalTrades}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem', display: 'block' }}>
                            Win Rate
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 800,
                              fontFamily: `'JetBrains Mono', monospace`,
                              color: perf.totalTrades > 0 && perf.winRate >= 50 ? 'success.main' : 'text.primary',
                            }}
                          >
                            {perf.totalTrades > 0 ? `${perf.winRate}%` : '—'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem', display: 'block' }}>
                            Net P&L
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 800,
                              fontFamily: `'JetBrains Mono', monospace`,
                              color: perf.totalTrades > 0 ? (isNetPositive ? 'success.main' : 'error.main') : 'text.primary',
                            }}
                          >
                            {perf.totalTrades > 0 ? formatCurrency(perf.netPnL) : '—'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem', display: 'block' }}>
                            Profit Factor
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                            {perf.totalTrades > 0 && perf.profitFactor ? perf.profitFactor : '—'}
                          </Typography>
                        </Box>
                      </Box>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {/* Strategy Create/Edit Modal */}
      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editingStrategy ? 'Edit Strategy Setup' : 'New Playbook Setup'}
          <IconButton size="small" onClick={() => setIsModalOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <form onSubmit={handleStrategySubmit}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {saveError && (
              <Alert severity="error" onClose={() => setSaveError(null)}>
                {saveError}
              </Alert>
            )}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 8 }}>
                <TextField
                  label="Strategy Name *"
                  fullWidth
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 5-Min Opening Range Breakout"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Minimum R:R *"
                  type="number"
                  fullWidth
                  required
                  slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
                  value={minRiskReward}
                  onChange={(e) => setMinRiskReward(Number(e.target.value))}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Description & Strategic Thesis"
                  fullWidth
                  multiline
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe market regime, higher timeframe context, and entry triggers..."
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Entry Rules (one per line)"
                  fullWidth
                  multiline
                  rows={3}
                  value={entryRulesInput}
                  onChange={(e) => setEntryRulesInput(e.target.value)}
                  placeholder="1. Break of 15m high&#10;2. Volume > 1.5x 20 EMA&#10;3. VWAP aligned"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Stop Loss Rules (one per line)"
                  fullWidth
                  multiline
                  rows={3}
                  value={stopRulesInput}
                  onChange={(e) => setStopRulesInput(e.target.value)}
                  placeholder="1. Below breakout candle low&#10;2. Max 0.5% index points"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Target Rules (one per line)"
                  fullWidth
                  multiline
                  rows={3}
                  value={targetRulesInput}
                  onChange={(e) => setTargetRulesInput(e.target.value)}
                  placeholder="1. Minimum 1:2 R:R&#10;2. Previous day high resistance"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Invalidation Criteria (one per line)"
                  fullWidth
                  multiline
                  rows={3}
                  value={invalidationInput}
                  onChange={(e) => setInvalidationInput(e.target.value)}
                  placeholder="1. Candle closes back inside range&#10;2. Momentum divergence on 5m RSI"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setIsModalOpen(false)} color="inherit" disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={saveMutation.isPending}
              startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {saveMutation.isPending ? 'Saving...' : editingStrategy ? 'Update Strategy' : 'Save Setup'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Strategy Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteConfirmId)}
        onClose={() => {
          setDeleteConfirmId(null);
          setDeleteError(null);
        }}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Strategy Setup</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {deleteError && (
            <Alert severity="error" onClose={() => setDeleteError(null)}>
              {deleteError}
            </Alert>
          )}
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
            Are you sure you want to delete this strategy setup from your playbook? Historical trades will remain intact.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setDeleteConfirmId(null);
              setDeleteError(null);
            }}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            startIcon={deleteMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={() => {
              if (deleteConfirmId) {
                deleteMutation.mutate(deleteConfirmId);
              }
            }}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create / Edit Template Dialog */}
      <Dialog
        open={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editingTemplate ? 'Edit Setup Template' : 'New Market Setup Template'}
          <IconButton size="small" onClick={() => setIsTemplateModalOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <form onSubmit={handleTemplateSubmit}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Template Name *"
              size="small"
              required
              fullWidth
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="e.g. London Open Breakout Long"
            />

            <TextField
              label="Description"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={tplDesc}
              onChange={(e) => setTplDesc(e.target.value)}
              placeholder="e.g. Asian session liquidity sweep with high-volume displacement at London open"
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Category / Group</InputLabel>
                <Select
                  value={tplGroup}
                  label="Category / Group"
                  onChange={(e) => setTplGroup(e.target.value as TemplateGroup)}
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
                <InputLabel>Direction</InputLabel>
                <Select
                  value={tplDirection}
                  label="Direction"
                  onChange={(e) => setTplDirection(e.target.value as any)}
                >
                  <MenuItem value="">Any (Direction Neutral)</MenuItem>
                  <MenuItem value="LONG">Long Only</MenuItem>
                  <MenuItem value="SHORT">Short Only</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Stop Loss Rule</InputLabel>
                <Select
                  value={tplSlType}
                  label="Stop Loss Rule"
                  onChange={(e) => setTplSlType(e.target.value as SlRuleType)}
                >
                  <MenuItem value="PERCENT">Percent (%)</MenuItem>
                  <MenuItem value="POINTS">Fixed Points</MenuItem>
                  <MenuItem value="PREMIUM_PERCENT">Option Premium %</MenuItem>
                  <MenuItem value="MANUAL">Manual Technical</MenuItem>
                </Select>
              </FormControl>

              {tplSlType !== 'MANUAL' ? (
                <TextField
                  label={tplSlType === 'PERCENT' ? 'SL Percent (%)' : 'SL Points'}
                  type="number"
                  size="small"
                  fullWidth
                  value={tplSlValue}
                  onChange={(e) => setTplSlValue(Number(e.target.value) || 0)}
                  slotProps={{ htmlInput: { step: 'any' } }}
                />
              ) : (
                <TextField
                  label="Manual Hint"
                  size="small"
                  fullWidth
                  placeholder="e.g. Below 15m swing low"
                  value={tplManualHint}
                  onChange={(e) => setTplManualHint(e.target.value)}
                />
              )}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 1.5 }}>
              <TextField
                label="Minimum R:R *"
                type="number"
                size="small"
                fullWidth
                value={tplMinRR}
                onChange={(e) => setTplMinRR(Number(e.target.value) || 1.5)}
                slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
              />

              <TextField
                label="Strategy Name"
                size="small"
                fullWidth
                placeholder="Linked playbook strategy"
                value={tplStrategyName}
                onChange={(e) => setTplStrategyName(e.target.value)}
              />
            </Box>

            <TextField
              label="Title Pattern *"
              size="small"
              fullWidth
              value={tplTitlePattern}
              onChange={(e) => setTplTitlePattern(e.target.value)}
              helperText="Available tokens: {symbol}, {direction}, {date}"
            />

            <TextField
              label="Tags (comma-separated)"
              size="small"
              fullWidth
              placeholder="e.g. london, breakout, trend"
              value={tplTagsInput}
              onChange={(e) => setTplTagsInput(e.target.value)}
            />

            <TextField
              label="Confluences (comma-separated)"
              size="small"
              fullWidth
              placeholder="e.g. BOS, FVG, VWAP"
              value={tplConfluencesInput}
              onChange={(e) => setTplConfluencesInput(e.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setIsTemplateModalOpen(false)} color="inherit" disabled={saveTemplateMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={saveTemplateMutation.isPending}
              startIcon={saveTemplateMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            >
              {saveTemplateMutation.isPending ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Template Confirmation Dialog */}
      <Dialog
        open={Boolean(templateDeleteConfirmId)}
        onClose={() => setTemplateDeleteConfirmId(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Setup Template</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary }}>
            Are you sure you want to delete this custom setup template? Existing trade logs using this template will preserve their records.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTemplateDeleteConfirmId(null)} disabled={deleteTemplateMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteTemplateMutation.isPending}
            onClick={() => {
              if (templateDeleteConfirmId) {
                deleteTemplateMutation.mutate(templateDeleteConfirmId);
              }
            }}
          >
            {deleteTemplateMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
