import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link as RouterLink } from 'react-router-dom';
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
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import MenuBookIcon from '@mui/icons-material/MenuBookRounded';
import AddIcon from '@mui/icons-material/AddRounded';
import EditIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import LayersIcon from '@mui/icons-material/LayersRounded';
import StarIcon from '@mui/icons-material/StarRounded';
import StarBorderIcon from '@mui/icons-material/StarBorderRounded';
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded';
import CheckIcon from '@mui/icons-material/CheckRounded';
import WarningAmberIcon from '@mui/icons-material/WarningAmberRounded';
import FullscreenIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExitRounded';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebarRounded';
import TabIcon from '@mui/icons-material/TabRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreRounded';

import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { formatCurrency, formatPercent } from '../lib/utils.js';
import { useTradeDrilldown } from '../context/TradeDrillContext.js';
import { DateRangeFilter } from '../components/ui/DateRangeFilter.js';
import { useDateRange } from '../context/DateRangeContext.js';
import {
  ITradeTemplate,
  TemplateGroup,
  SlRuleType,
  AssetClass,
} from '@tradevault/shared';

export function StrategyPlaybookPage() {
  const { openDrill } = useTradeDrilldown();
  const queryClient = useQueryClient();
  const { startDate, endDate } = useDateRange();
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

  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isModalMaximized, setIsModalMaximized] = useState(false);
  const [modalLayoutMode, setModalLayoutMode] = useState<'SPLIT' | 'TABS'>('SPLIT');
  const [modalActiveTab, setModalActiveTab] = useState<'THESIS' | 'RULES' | 'VARIANTS' | 'CHECKLIST'>('THESIS');
  const [expandedStrategyId, setExpandedStrategyId] = useState<string | null>(null);

  // Child variants state for strategy modal
  const [variants, setVariants] = useState<any[]>([]);
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [editingVariantIndex, setEditingVariantIndex] = useState<number | null>(null);
  const [variantKey, setVariantKey] = useState('');
  const [variantName, setVariantName] = useState('');
  const [variantDesc, setVariantDesc] = useState('');
  const [variantIsActive, setVariantIsActive] = useState(true);
  const [variantMinRR, setVariantMinRR] = useState<number | ''>('');
  const [variantDirection, setVariantDirection] = useState<'LONG' | 'SHORT' | ''>('');
  const [variantPatternType, setVariantPatternType] = useState<string>('');
  const [variantSecondLegStatus, setVariantSecondLegStatus] = useState<string>('');
  const [variantLiquiditySide, setVariantLiquiditySide] = useState<string>('');
  const [variantEntryModel, setVariantEntryModel] = useState<string>('');
  const [variantEntryRules, setVariantEntryRules] = useState('');
  const [variantStopLossRules, setVariantStopLossRules] = useState('');
  const [variantTargetRules, setVariantTargetRules] = useState('');
  const [variantInvalidation, setVariantInvalidation] = useState('');
  const [variantChecklist, setVariantChecklist] = useState('');

  const { data: strategies = [], isLoading: isLoadingStrategies } = useQuery({
    queryKey: ['strategies', startDate, endDate],
    queryFn: () => api.strategies.list({ startDate, endDate }),
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
    setVariants([]);
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
    setVariants(strat.variants ? JSON.parse(JSON.stringify(strat.variants)) : []);
    setSaveError(null);
    setIsModalOpen(true);
  };

  const handleOpenAddVariant = () => {
    setEditingVariantIndex(null);
    setVariantKey('');
    setVariantName('');
    setVariantDesc('');
    setVariantIsActive(true);
    setVariantMinRR('');
    setVariantDirection('');
    setVariantPatternType('');
    setVariantSecondLegStatus('');
    setVariantLiquiditySide('');
    setVariantEntryModel('');
    setVariantEntryRules('');
    setVariantStopLossRules('');
    setVariantTargetRules('');
    setVariantInvalidation('');
    setVariantChecklist('');
    setIsVariantModalOpen(true);
  };

  const handleOpenEditVariant = (index: number) => {
    const v = variants[index];
    if (!v) return;
    setEditingVariantIndex(index);
    setVariantKey(v.key);
    setVariantName(v.name);
    setVariantDesc(v.description || '');
    setVariantIsActive(v.isActive !== false);
    setVariantMinRR(v.minRiskReward !== null && v.minRiskReward !== undefined ? v.minRiskReward : '');
    setVariantDirection(v.expected?.direction || '');
    setVariantPatternType(v.expected?.patternType || '');
    setVariantSecondLegStatus(v.expected?.secondLegStatus || '');
    setVariantLiquiditySide(v.expected?.liquiditySide || '');
    setVariantEntryModel(v.expected?.entryModel || '');
    setVariantEntryRules((v.entryRules || []).join('\n'));
    setVariantStopLossRules((v.stopLossRules || []).join('\n'));
    setVariantTargetRules((v.targetRules || []).join('\n'));
    setVariantInvalidation((v.invalidationCriteria || []).join('\n'));
    setVariantChecklist((v.checklist || []).join('\n'));
    setIsVariantModalOpen(true);
  };

  const handleSaveVariant = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = variantKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    if (!cleanKey) {
      toast.warning('Variant Key is required (e.g. VAR-01, PULLBACK_A)');
      return;
    }
    if (!variantName.trim()) {
      toast.warning('Variant Name is required');
      return;
    }

    const duplicateIdx = variants.findIndex((v, i) => v.key === cleanKey && i !== editingVariantIndex);
    if (duplicateIdx >= 0) {
      toast.error(`A variant with key "${cleanKey}" already exists on this strategy.`);
      return;
    }

    const newVariant: any = {
      key: cleanKey,
      name: variantName.trim(),
      description: variantDesc.trim() || undefined,
      isActive: variantIsActive,
      sortOrder:
        editingVariantIndex !== null
          ? variants[editingVariantIndex].sortOrder ?? editingVariantIndex + 1
          : variants.length + 1,
      minRiskReward: variantMinRR !== '' ? Number(variantMinRR) : null,
      expected: {
        direction: variantDirection || undefined,
        patternType: variantPatternType || undefined,
        secondLegStatus: variantSecondLegStatus || undefined,
        liquiditySide: variantLiquiditySide || undefined,
        entryModel: variantEntryModel || undefined,
      },
      entryRules: variantEntryRules.split('\n').map((s) => s.trim()).filter(Boolean),
      stopLossRules: variantStopLossRules.split('\n').map((s) => s.trim()).filter(Boolean),
      targetRules: variantTargetRules.split('\n').map((s) => s.trim()).filter(Boolean),
      invalidationCriteria: variantInvalidation.split('\n').map((s) => s.trim()).filter(Boolean),
      checklist: variantChecklist.split('\n').map((s) => s.trim()).filter(Boolean),
    };

    if (editingVariantIndex !== null) {
      const updated = [...variants];
      updated[editingVariantIndex] = newVariant;
      setVariants(updated);
    } else {
      setVariants([...variants, newVariant]);
    }

    setIsVariantModalOpen(false);
  };

  const handleToggleArchiveVariant = (index: number) => {
    const updated = [...variants];
    updated[index].isActive = !updated[index].isActive;
    setVariants(updated);
  };

  const handleDeleteVariant = (index: number) => {
    const updated = variants.filter((_, i) => i !== index);
    setVariants(updated);
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
      variants,
      assetClasses: editingStrategy?.assetClasses || ['EQUITY', 'FUTURES'],
      timeframes: editingStrategy?.timeframes || ['5m', '15m'],
      tags: editingStrategy?.tags || [],
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

  const renderVariantsManager = () => (
    <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Child Setup Variants ({variants.length})
            </Typography>
            <Chip label="Full Custom" size="small" color="primary" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }} />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Define specific variants under this parent strategy. Each variant inherits parent rules and can override triggers, min R:R, and expected attributes.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenAddVariant}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Add Setup Variant
        </Button>
      </Box>

      {variants.length === 0 ? (
        <Card sx={{ p: 3, textAlign: 'center', borderStyle: 'dashed', bgcolor: isDark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)' }}>
          <Typography variant="body2" color="text.secondary">
            No child variants defined yet. Trades assigned to this strategy will be recorded as UNCLASSIFIED until a variant is assigned.
          </Typography>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {variants.map((v, idx) => (
            <Grid key={v.key || idx} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card
                sx={{
                  p: 2,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  border: `1px solid ${muiTheme.palette.divider}`,
                  bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                  opacity: v.isActive === false ? 0.6 : 1,
                }}
              >
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                        {v.key}
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                        {v.name}
                      </Typography>
                    </Box>
                    <Chip
                      label={v.isActive !== false ? 'Active' : 'Archived'}
                      size="small"
                      color={v.isActive !== false ? 'success' : 'default'}
                      sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
                    />
                  </Box>

                  {v.description && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {v.description}
                    </Typography>
                  )}

                  {/* Expected Attributes Chips */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                    {v.expected?.direction && (
                      <Chip label={v.expected.direction} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                    )}
                    {v.expected?.patternType && (
                      <Chip label={`Pattern: ${v.expected.patternType}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                    )}
                    {v.expected?.secondLegStatus && v.expected.secondLegStatus !== 'NOT_APPLICABLE' && (
                      <Chip label={`Leg: ${v.expected.secondLegStatus}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                    )}
                    {v.expected?.liquiditySide && v.expected.liquiditySide !== 'NONE' && (
                      <Chip label={`Side: ${v.expected.liquiditySide}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                    )}
                    {v.minRiskReward !== null && v.minRiskReward !== undefined && (
                      <Chip label={`Min R:R 1:${v.minRiskReward}`} size="small" variant="outlined" color="primary" sx={{ height: 18, fontSize: '0.625rem' }} />
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, pt: 1, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
                  <Button size="small" onClick={() => handleOpenEditVariant(idx)} sx={{ fontSize: '0.75rem', textTransform: 'none' }}>
                    Edit
                  </Button>
                  <Button
                    size="small"
                    color={v.isActive !== false ? 'warning' : 'success'}
                    onClick={() => handleToggleArchiveVariant(idx)}
                    sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                  >
                    {v.isActive !== false ? 'Archive' : 'Activate'}
                  </Button>
                  <IconButton size="small" color="error" onClick={() => handleDeleteVariant(idx)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );

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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <DateRangeFilter />
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
                        <Grid
                          container
                          spacing={1.5}
                          onClick={() =>
                            openDrill({
                              kind: 'FILTER',
                              filter: { strategyId: strat.id || strat._id },
                              label: `${strat.name} Executions`,
                            })
                          }
                          sx={{
                            mt: 2,
                            p: 1.5,
                            borderRadius: 2,
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                            border: `1px solid ${muiTheme.palette.divider}`,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            '&:hover': {
                              borderColor: muiTheme.palette.primary.main,
                              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)',
                            },
                          }}
                        >
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

                        {/* Edge Validation Engine Panel */}
                        <Box
                          sx={{
                            mt: 2,
                            p: 1.5,
                            borderRadius: 2,
                            backgroundColor: isDark
                              ? strat.edge?.verdict === 'LIKELY_EDGE'
                                ? 'rgba(16, 185, 129, 0.08)'
                                : strat.edge?.verdict === 'NO_EDGE_NEGATIVE'
                                ? 'rgba(239, 68, 68, 0.08)'
                                : 'rgba(245, 158, 11, 0.05)'
                              : strat.edge?.verdict === 'LIKELY_EDGE'
                              ? 'rgba(16, 185, 129, 0.08)'
                              : strat.edge?.verdict === 'NO_EDGE_NEGATIVE'
                              ? 'rgba(239, 68, 68, 0.08)'
                              : 'rgba(245, 158, 11, 0.06)',
                            border: `1px solid ${
                              strat.edge?.verdict === 'LIKELY_EDGE'
                                ? 'rgba(16, 185, 129, 0.35)'
                                : strat.edge?.verdict === 'NO_EDGE_NEGATIVE'
                                ? 'rgba(239, 68, 68, 0.35)'
                                : isDark
                                ? 'rgba(255, 255, 255, 0.1)'
                                : 'rgba(0, 0, 0, 0.1)'
                            }`,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: muiTheme.palette.text.secondary,
                                fontSize: '0.625rem',
                              }}
                            >
                              Edge Validation Engine
                            </Typography>
                            <Chip
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDrill({
                                  kind: 'FILTER',
                                  filter: { strategyId: strat.id || strat._id },
                                  label: `${strat.name} Trades (${strat.edge?.verdict || 'Edge Validation'})`,
                                });
                              }}
                              icon={
                                strat.edge?.verdict === 'LIKELY_EDGE' ? (
                                  <CheckCircleOutlineIcon sx={{ fontSize: '13px !important' }} />
                                ) : strat.edge?.verdict === 'NO_EDGE_NEGATIVE' ? (
                                  <CloseIcon sx={{ fontSize: '13px !important' }} />
                                ) : (
                                  <WarningAmberIcon sx={{ fontSize: '13px !important' }} />
                                )
                              }
                              label={
                                strat.edge?.verdict === 'LIKELY_EDGE'
                                  ? 'Likely Edge'
                                  : strat.edge?.verdict === 'NO_EDGE_NEGATIVE'
                                  ? 'Negative Edge'
                                  : 'Unproven Edge'
                              }
                              color={
                                strat.edge?.verdict === 'LIKELY_EDGE'
                                  ? 'success'
                                  : strat.edge?.verdict === 'NO_EDGE_NEGATIVE'
                                  ? 'error'
                                  : 'warning'
                              }
                              sx={{ fontWeight: 700, fontSize: '0.625rem', height: 20, cursor: 'pointer' }}
                            />
                          </Box>

                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              color: muiTheme.palette.text.secondary,
                              mb: 1.25,
                              fontSize: '0.6875rem',
                              lineHeight: 1.3,
                            }}
                          >
                            {strat.edge?.explanation || 'Awaiting closed trades for statistical edge validation.'}
                          </Typography>

                          {/* Statistically adjusted metrics */}
                          <Grid container spacing={1}>
                            <Grid size={{ xs: 6 }}>
                              <Box
                                sx={{
                                  p: 1,
                                  borderRadius: 1.5,
                                  backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)',
                                  border: `1px solid ${muiTheme.palette.divider}`,
                                }}
                              >
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                                  Bootstrap Exp. (R)
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 800,
                                    fontFamily: `'JetBrains Mono', monospace`,
                                    fontSize: '0.75rem',
                                    color:
                                      (strat.edge?.bootstrapExpectancy?.observedExpectancyR ?? 0) >= 0
                                        ? 'success.main'
                                        : 'error.main',
                                  }}
                                >
                                  {strat.edge?.bootstrapExpectancy?.observedExpectancyR !== undefined
                                    ? `${strat.edge.bootstrapExpectancy.observedExpectancyR >= 0 ? '+' : ''}${strat.edge.bootstrapExpectancy.observedExpectancyR.toFixed(2)}R`
                                    : '—'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.5625rem' }}>
                                  90% CI: [{strat.edge?.bootstrapExpectancy?.bootstrapInterval90 ? `${strat.edge.bootstrapExpectancy.bootstrapInterval90[0].toFixed(2)}, ${strat.edge.bootstrapExpectancy.bootstrapInterval90[1].toFixed(2)}` : '—'}]
                                </Typography>
                              </Box>
                            </Grid>

                            <Grid size={{ xs: 6 }}>
                              <Box
                                sx={{
                                  p: 1,
                                  borderRadius: 1.5,
                                  backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)',
                                  border: `1px solid ${muiTheme.palette.divider}`,
                                }}
                              >
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                                  P(Expectancy &gt; 0)
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.75rem' }}>
                                  {strat.edge?.bootstrapExpectancy?.probPositiveExpectancy !== undefined
                                    ? `${(strat.edge.bootstrapExpectancy.probPositiveExpectancy * 100).toFixed(1)}%`
                                    : '—'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.5625rem' }}>
                                  Sample N = {strat.edge?.sampleSize ?? strat.totalTrades ?? 0}
                                </Typography>
                              </Box>
                            </Grid>

                            <Grid size={{ xs: 6 }}>
                              <Box
                                sx={{
                                  p: 1,
                                  borderRadius: 1.5,
                                  backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)',
                                  border: `1px solid ${muiTheme.palette.divider}`,
                                }}
                              >
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                                  Bayesian Win Rate
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.75rem' }}>
                                  {strat.edge?.bayesianWinRate?.posteriorMeanWinRate !== undefined
                                    ? `${strat.edge.bayesianWinRate.posteriorMeanWinRate.toFixed(1)}%`
                                    : '—'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.5625rem' }}>
                                  90% CrI: [{strat.edge?.bayesianWinRate?.credibleInterval90 ? `${strat.edge.bayesianWinRate.credibleInterval90[0].toFixed(1)}%, ${strat.edge.bayesianWinRate.credibleInterval90[1].toFixed(1)}%` : '—'}]
                                </Typography>
                              </Box>
                            </Grid>

                            <Grid size={{ xs: 6 }}>
                              <Box
                                sx={{
                                  p: 1,
                                  borderRadius: 1.5,
                                  backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)',
                                  border: `1px solid ${muiTheme.palette.divider}`,
                                }}
                              >
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>
                                  Breakeven WR
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace`, fontSize: '0.75rem' }}>
                                  {strat.edge?.bayesianWinRate?.breakevenWinRate !== undefined
                                    ? `${strat.edge.bayesianWinRate.breakevenWinRate.toFixed(1)}%`
                                    : 'N/A'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.5625rem' }}>
                                  P(WR &gt; BE): {strat.edge?.bayesianWinRate?.probExceedsBreakeven !== undefined ? `${(strat.edge.bayesianWinRate.probExceedsBreakeven * 100).toFixed(0)}%` : '—'}
                                </Typography>
                              </Box>
                            </Grid>
                          </Grid>
                        </Box>

                        {/* Rules counts & Expand Action */}
                        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            <Chip size="small" variant="outlined" label={`Min R:R 1:${strat.minRiskReward || 1.5}`} sx={{ fontWeight: 600, fontSize: '0.6875rem' }} />
                            <Chip size="small" variant="outlined" color="primary" label={`${strat.variants?.length || 0} Variants`} sx={{ fontSize: '0.6875rem', fontWeight: 700 }} />
                            <Chip size="small" variant="outlined" color="success" label={`${strat.entryRules?.length || 0} Entry Rules`} sx={{ fontSize: '0.6875rem', fontWeight: 600 }} />
                            <Chip size="small" variant="outlined" color="error" label={`${strat.stopLossRules?.length || 0} SL Rules`} sx={{ fontSize: '0.6875rem', fontWeight: 600 }} />
                            <Chip size="small" variant="outlined" color="warning" label={`${strat.invalidationCriteria?.length || 0} Invalidation`} sx={{ fontSize: '0.6875rem', fontWeight: 600 }} />
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              color="secondary"
                              onClick={() =>
                                openDrill({
                                  kind: 'FILTER',
                                  filter: { strategyId: strat.id || strat._id },
                                  label: `${strat.name} Trades`,
                                })
                              }
                              sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'none', py: 0.25 }}
                            >
                              Trades ({strat.totalTrades || 0})
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              component={RouterLink}
                              to={`/strategies/${strat.id || strat._id}/analytics`}
                              state={{ from: '/strategies' }}
                              sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'none', py: 0.25 }}
                            >
                              Compare Variants
                            </Button>
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => setExpandedStrategyId(expandedStrategyId === (strat.id || strat._id) ? null : (strat.id || strat._id))}
                              endIcon={<ExpandMoreIcon sx={{ transform: expandedStrategyId === (strat.id || strat._id) ? 'rotate(180deg)' : 'none', transition: '0.2s', fontSize: 16 }} />}
                              sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'none', py: 0.25 }}
                            >
                              {expandedStrategyId === (strat.id || strat._id) ? 'Hide Rules' : 'Expand Rules'}
                            </Button>
                          </Box>
                        </Box>

                        {/* Collapsible Expanded Rules Section */}
                        {expandedStrategyId === (strat.id || strat._id) && (
                          <Box
                            sx={{
                              mt: 2,
                              p: 2,
                              borderRadius: 2,
                              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(248, 250, 252, 0.9)',
                              border: `1px solid ${muiTheme.palette.divider}`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 1.5,
                            }}
                          >
                            {strat.description && (
                              <Box>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.625rem', display: 'block', mb: 0.5 }}>
                                  Strategic Thesis & Preparation
                                </Typography>
                                <Typography variant="body2" sx={{ fontSize: '0.75rem', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                                  {strat.description}
                                </Typography>
                              </Box>
                            )}

                            {strat.entryRules && strat.entryRules.length > 0 && (
                              <Box>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: 'success.main', textTransform: 'uppercase', fontSize: '0.625rem', display: 'block', mb: 0.5 }}>
                                  Entry Confirmation Rules
                                </Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.75rem', lineHeight: 1.5 }}>
                                  {strat.entryRules.map((rule: string, i: number) => (
                                    <li key={i}>{rule}</li>
                                  ))}
                                </Box>
                              </Box>
                            )}

                            {strat.stopLossRules && strat.stopLossRules.length > 0 && (
                              <Box>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: 'error.main', textTransform: 'uppercase', fontSize: '0.625rem', display: 'block', mb: 0.5 }}>
                                  Stop Loss Rules
                                </Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.75rem', lineHeight: 1.5 }}>
                                  {strat.stopLossRules.map((rule: string, i: number) => (
                                    <li key={i}>{rule}</li>
                                  ))}
                                </Box>
                              </Box>
                            )}

                            {strat.targetRules && strat.targetRules.length > 0 && (
                              <Box>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main', textTransform: 'uppercase', fontSize: '0.625rem', display: 'block', mb: 0.5 }}>
                                  Profit Targets
                                </Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.75rem', lineHeight: 1.5 }}>
                                  {strat.targetRules.map((rule: string, i: number) => (
                                    <li key={i}>{rule}</li>
                                  ))}
                                </Box>
                              </Box>
                            )}

                            {strat.invalidationCriteria && strat.invalidationCriteria.length > 0 && (
                              <Box>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: 'warning.main', textTransform: 'uppercase', fontSize: '0.625rem', display: 'block', mb: 0.5 }}>
                                  Invalidation Conditions
                                </Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.75rem', lineHeight: 1.5 }}>
                                  {strat.invalidationCriteria.map((rule: string, i: number) => (
                                    <li key={i}>{rule}</li>
                                  ))}
                                </Box>
                              </Box>
                            )}
                          </Box>
                        )}
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

                      {/* Compact Statistical Edge Status */}
                      <Box
                        sx={{
                          pt: 1,
                          borderTop: `1px dashed ${muiTheme.palette.divider}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                        }}
                      >
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.625rem', fontWeight: 600 }}>
                          Edge Status
                        </Typography>
                        {perf.totalTrades < 30 ? (
                          <Tooltip
                            title={`Sample size N = ${perf.totalTrades}/30 trades. Statistical edge is unproven because small samples suffer from sampling randomness.`}
                            arrow
                          >
                            <Chip
                              size="small"
                              variant="outlined"
                              color="warning"
                              icon={<WarningAmberIcon sx={{ fontSize: '12px !important' }} />}
                              label={`Evidence Limited (${perf.totalTrades}/30)`}
                              sx={{ height: 20, fontSize: '0.5625rem', fontWeight: 700 }}
                            />
                          </Tooltip>
                        ) : (perf.meanExpectancyR ?? 0) > 0.15 ? (
                          <Tooltip
                            title={`Strategy edge validated with positive expectancy (+${perf.meanExpectancyR}R across ${perf.totalTrades} trades).`}
                            arrow
                          >
                            <Chip
                              size="small"
                              color="success"
                              icon={<CheckCircleOutlineIcon sx={{ fontSize: '12px !important' }} />}
                              label={`Likely Edge (+${perf.meanExpectancyR}R)`}
                              sx={{ height: 20, fontSize: '0.5625rem', fontWeight: 700 }}
                            />
                          </Tooltip>
                        ) : (perf.meanExpectancyR ?? 0) < 0 ? (
                          <Tooltip
                            title={`Negative expectancy (${perf.meanExpectancyR}R across ${perf.totalTrades} trades).`}
                            arrow
                          >
                            <Chip
                              size="small"
                              color="error"
                              icon={<CloseIcon sx={{ fontSize: '12px !important' }} />}
                              label={`Negative Edge (${perf.meanExpectancyR}R)`}
                              sx={{ height: 20, fontSize: '0.5625rem', fontWeight: 700 }}
                            />
                          </Tooltip>
                        ) : (
                          <Tooltip
                            title={`Expectancy is neutral or inconclusive (${perf.meanExpectancyR ?? 0}R).`}
                            arrow
                          >
                            <Chip
                              size="small"
                              variant="outlined"
                              color="warning"
                              label="Neutral Edge"
                              sx={{ height: 20, fontSize: '0.5625rem', fontWeight: 700 }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {/* Strategy Create/Edit Studio Modal */}
      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth={isModalMaximized ? false : 'xl'}
        fullWidth
        fullScreen={isModalMaximized}
        slotProps={{
          paper: {
            sx: {
              borderRadius: isModalMaximized ? 0 : 3,
              height: isModalMaximized ? '100vh' : '90vh',
              maxHeight: isModalMaximized ? '100vh' : '92vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: isDark ? '#0D1525' : '#FFFFFF',
            },
          },
        }}
      >
        <DialogTitle
          sx={{
            py: 2,
            px: 3,
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                p: 0.85,
                borderRadius: 2,
                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                color: 'primary.main',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <MenuBookIcon fontSize="small" />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
                  {editingStrategy ? 'Edit Strategy Playbook Setup' : 'New Playbook Setup Studio'}
                </Typography>
                <Chip
                  label={editingStrategy ? 'EDIT SETUP' : 'NEW PLAYBOOK'}
                  size="small"
                  color={editingStrategy ? 'primary' : 'success'}
                  sx={{ height: 20, fontSize: '0.625rem', fontWeight: 800 }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Codify higher-timeframe thesis, entry triggers, stop-loss invalidation, and profit-taking rules.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* View Mode Toggle: Split Studio vs Focused Tabs */}
            <ToggleButtonGroup
              size="small"
              value={modalLayoutMode}
              exclusive
              onChange={(_, val) => val && setModalLayoutMode(val)}
              sx={{ height: 32 }}
            >
              <ToggleButton value="SPLIT" sx={{ px: 1.25, py: 0.5, fontSize: '0.75rem', fontWeight: 700, gap: 0.5 }}>
                <ViewSidebarIcon sx={{ fontSize: 16 }} />
                Split Studio
              </ToggleButton>
              <ToggleButton value="TABS" sx={{ px: 1.25, py: 0.5, fontSize: '0.75rem', fontWeight: 700, gap: 0.5 }}>
                <TabIcon sx={{ fontSize: 16 }} />
                Focused Tabs
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Maximize Toggle */}
            <Tooltip title={isModalMaximized ? 'Restore Normal Window' : 'Maximize Studio (Full Screen Mode)'} arrow>
              <IconButton
                size="small"
                onClick={() => setIsModalMaximized(!isModalMaximized)}
                sx={{ border: `1px solid ${muiTheme.palette.divider}` }}
              >
                {isModalMaximized ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>

            {/* Close */}
            <IconButton size="small" onClick={() => setIsModalOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <form onSubmit={handleStrategySubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <DialogContent sx={{ p: 3, flex: 1, overflowY: 'auto' }}>
            {saveError && (
              <Alert severity="error" onClose={() => setSaveError(null)} sx={{ mb: 2.5 }}>
                {saveError}
              </Alert>
            )}

            {modalLayoutMode === 'SPLIT' ? (
              /* ================== SPLIT STUDIO MODE ================== */
              <Grid container spacing={3}>
                {/* Left Column: Identity, Thesis & Checklist (5 of 12) */}
                <Grid size={{ xs: 12, md: 5 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 8 }}>
                        <TextField
                          label="Strategy Setup Name *"
                          fullWidth
                          required
                          size="small"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. 5-Min Opening Range Breakout"
                          slotProps={{
                            input: { sx: { fontWeight: 700 } },
                          }}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <TextField
                          label="Min R:R *"
                          type="number"
                          fullWidth
                          required
                          size="small"
                          slotProps={{
                            htmlInput: { step: 0.1, min: 0 },
                            input: { sx: { fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700 } },
                          }}
                          value={minRiskReward}
                          onChange={(e) => setMinRiskReward(Number(e.target.value))}
                        />
                      </Grid>
                    </Grid>

                    {/* Description & Strategic Thesis (Maximized Height) */}
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.8125rem' }}>
                          Strategic Thesis & Preparation (Weekly / Daily / 4H)
                        </Typography>
                        <Chip label="Context & Bias" size="small" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 600 }} />
                      </Box>
                      <TextField
                        fullWidth
                        multiline
                        minRows={isModalMaximized ? 15 : 9}
                        maxRows={isModalMaximized ? 25 : 15}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="1. High Timeframe Preparation (Weekly / Daily / 4H)&#10;Step 1: On Weekly and Daily timeframes, locate the dominant market trend.&#10;Step 2: Mark previous day high (PDH), previous day low (PDL), and key S/R levels.&#10;Step 3: Define pre-market bias (Bullish / Bearish / Neutral) and market regime."
                        helperText="Document higher-timeframe structure, market regime, key levels, and narrative context."
                        slotProps={{
                          input: {
                            sx: {
                              fontSize: '0.84rem',
                              lineHeight: 1.6,
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                            },
                          },
                        }}
                      />
                    </Box>

                    {/* Pre-Flight Execution Checklist */}
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.8125rem' }}>
                          Pre-Flight Execution Checklist
                        </Typography>
                        <Chip label="Discipline Filter" size="small" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 600 }} />
                      </Box>
                      <TextField
                        fullWidth
                        multiline
                        minRows={isModalMaximized ? 8 : 4}
                        maxRows={isModalMaximized ? 14 : 7}
                        value={checklistInput}
                        onChange={(e) => setChecklistInput(e.target.value)}
                        placeholder="1. High Timeframe Key Level Tested&#10;2. London/NY Session Volume Active&#10;3. Risk capped at <= 1% equity&#10;4. No high-impact CPI news in next 15 mins"
                        helperText="Mandatory rules (one per line) that must be verified before executing order."
                        slotProps={{
                          input: {
                            sx: {
                              fontSize: '0.8125rem',
                              lineHeight: 1.5,
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                            },
                          },
                        }}
                      />
                    </Box>
                  </Box>
                </Grid>

                {/* Right Column: Execution Rules Cards (7 of 12) */}
                <Grid size={{ xs: 12, md: 7 }}>
                  <Grid container spacing={2}>
                    {/* Entry Rules */}
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Card
                        sx={{
                          p: 2,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          borderRadius: 2,
                          border: `1px solid ${muiTheme.palette.divider}`,
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.03)' : 'rgba(16, 185, 129, 0.02)',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'success.main', fontSize: '0.8125rem' }}>
                            1. Entry Rules & Triggers
                          </Typography>
                          <Chip label="Green Light" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 700 }} />
                        </Box>
                        <TextField
                          fullWidth
                          multiline
                          minRows={isModalMaximized ? 8 : 5}
                          maxRows={isModalMaximized ? 14 : 8}
                          value={entryRulesInput}
                          onChange={(e) => setEntryRulesInput(e.target.value)}
                          placeholder="1. Break of 15m structural high&#10;2. Volume > 1.5x 20 EMA&#10;3. VWAP aligned with momentum"
                          slotProps={{
                            input: {
                              sx: {
                                fontSize: '0.8125rem',
                                lineHeight: 1.5,
                              },
                            },
                          }}
                        />
                      </Card>
                    </Grid>

                    {/* Stop Loss Rules */}
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Card
                        sx={{
                          p: 2,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          borderRadius: 2,
                          border: `1px solid ${muiTheme.palette.divider}`,
                          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.03)' : 'rgba(239, 68, 68, 0.02)',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'error.main', fontSize: '0.8125rem' }}>
                            2. Stop Loss & Risk Rules
                          </Typography>
                          <Chip label="Capital Shield" size="small" color="error" variant="outlined" sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 700 }} />
                        </Box>
                        <TextField
                          fullWidth
                          multiline
                          minRows={isModalMaximized ? 8 : 5}
                          maxRows={isModalMaximized ? 14 : 8}
                          value={stopRulesInput}
                          onChange={(e) => setStopRulesInput(e.target.value)}
                          placeholder="1. Place Stop Loss strictly below the sweep wick&#10;2. Max 0.5% index points distance&#10;3. Never move stop further away"
                          slotProps={{
                            input: {
                              sx: {
                                fontSize: '0.8125rem',
                                lineHeight: 1.5,
                              },
                            },
                          }}
                        />
                      </Card>
                    </Grid>

                    {/* Target Rules */}
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Card
                        sx={{
                          p: 2,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          borderRadius: 2,
                          border: `1px solid ${muiTheme.palette.divider}`,
                          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.03)' : 'rgba(59, 130, 246, 0.02)',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main', fontSize: '0.8125rem' }}>
                            3. Profit Targets & Scaling
                          </Typography>
                          <Chip label="Take Profit" size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 700 }} />
                        </Box>
                        <TextField
                          fullWidth
                          multiline
                          minRows={isModalMaximized ? 8 : 5}
                          maxRows={isModalMaximized ? 14 : 8}
                          value={targetRulesInput}
                          onChange={(e) => setTargetRulesInput(e.target.value)}
                          placeholder="Target 1 (Base): 1-Hour swing high or overhead liquidity pool (Book 50%)&#10;Target 2 (Runner): Hold for HTF expansion target with trailing stop"
                          slotProps={{
                            input: {
                              sx: {
                                fontSize: '0.8125rem',
                                lineHeight: 1.5,
                              },
                            },
                          }}
                        />
                      </Card>
                    </Grid>

                    {/* Invalidation Criteria */}
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Card
                        sx={{
                          p: 2,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          borderRadius: 2,
                          border: `1px solid ${muiTheme.palette.divider}`,
                          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.03)' : 'rgba(245, 158, 11, 0.02)',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'warning.main', fontSize: '0.8125rem' }}>
                            4. Invalidation Criteria
                          </Typography>
                          <Chip label="Immediate Exit" size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: '0.5625rem', fontWeight: 700 }} />
                        </Box>
                        <TextField
                          fullWidth
                          multiline
                          minRows={isModalMaximized ? 8 : 5}
                          maxRows={isModalMaximized ? 14 : 8}
                          value={invalidationInput}
                          onChange={(e) => setInvalidationInput(e.target.value)}
                          placeholder="1. If price prints a 5m close below support, thesis of support defense is invalidated.&#10;2. Sudden absorption failure with high selling delta."
                          slotProps={{
                            input: {
                              sx: {
                                fontSize: '0.8125rem',
                                lineHeight: 1.5,
                              },
                            },
                          }}
                        />
                      </Card>
                    </Grid>
                  </Grid>
                </Grid>
                {/* Full-Width Child Setup Variants Section in Split Mode */}
                <Grid size={{ xs: 12 }}>
                  {renderVariantsManager()}
                </Grid>
              </Grid>
            ) : (
              /* ================== FOCUSED TABS MODE ================== */
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Tabs
                  value={modalActiveTab}
                  onChange={(_, val) => setModalActiveTab(val)}
                  sx={{ borderBottom: `1px solid ${muiTheme.palette.divider}`, minHeight: 40 }}
                >
                  <Tab label="1. Thesis & Strategic Context" value="THESIS" sx={{ fontWeight: 700, fontSize: '0.8125rem' }} />
                  <Tab label="2. Entry & Stop Loss Rules" value="RULES" sx={{ fontWeight: 700, fontSize: '0.8125rem' }} />
                  <Tab label="3. Targets & Invalidation" value="TARGETS" sx={{ fontWeight: 700, fontSize: '0.8125rem' }} />
                  <Tab label="4. Pre-Flight Checklist" value="CHECKLIST" sx={{ fontWeight: 700, fontSize: '0.8125rem' }} />
                  <Tab label={`5. Setup Variants (${variants.length})`} value="VARIANTS" sx={{ fontWeight: 700, fontSize: '0.8125rem' }} />
                </Tabs>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <TextField
                      label="Strategy Name *"
                      fullWidth
                      required
                      size="small"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="Minimum R:R *"
                      type="number"
                      fullWidth
                      required
                      size="small"
                      value={minRiskReward}
                      onChange={(e) => setMinRiskReward(Number(e.target.value))}
                    />
                  </Grid>
                </Grid>

                {modalActiveTab === 'THESIS' && (
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                      Describe high-timeframe market structure, preparation routine, and strategic narrative in full detail:
                    </Typography>
                    <TextField
                      fullWidth
                      multiline
                      minRows={isModalMaximized ? 20 : 13}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Write comprehensive strategic preparation thesis..."
                      slotProps={{ input: { sx: { fontSize: '0.875rem', lineHeight: 1.7 } } }}
                    />
                  </Box>
                )}

                {modalActiveTab === 'RULES' && (
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'success.main', mb: 1 }}>
                        Entry Rules & Execution Triggers
                      </Typography>
                      <TextField
                        fullWidth
                        multiline
                        minRows={isModalMaximized ? 18 : 12}
                        value={entryRulesInput}
                        onChange={(e) => setEntryRulesInput(e.target.value)}
                        placeholder="1. Entry condition A&#10;2. Entry condition B..."
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'error.main', mb: 1 }}>
                        Stop Loss & Risk Placement Rules
                      </Typography>
                      <TextField
                        fullWidth
                        multiline
                        minRows={isModalMaximized ? 18 : 12}
                        value={stopRulesInput}
                        onChange={(e) => setStopRulesInput(e.target.value)}
                        placeholder="1. Stop loss condition A&#10;2. Stop loss condition B..."
                      />
                    </Grid>
                  </Grid>
                )}

                {modalActiveTab === ('TARGETS' as any) && (
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main', mb: 1 }}>
                        Profit Targets & Scaling Strategy
                      </Typography>
                      <TextField
                        fullWidth
                        multiline
                        minRows={isModalMaximized ? 18 : 12}
                        value={targetRulesInput}
                        onChange={(e) => setTargetRulesInput(e.target.value)}
                        placeholder="1. Profit target 1&#10;2. Runner target 2..."
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'warning.main', mb: 1 }}>
                        Invalidation Conditions & Manual Exits
                      </Typography>
                      <TextField
                        fullWidth
                        multiline
                        minRows={isModalMaximized ? 18 : 12}
                        value={invalidationInput}
                        onChange={(e) => setInvalidationInput(e.target.value)}
                        placeholder="1. Invalidation signal A&#10;2. Early exit condition B..."
                      />
                    </Grid>
                  </Grid>
                )}

                {modalActiveTab === 'CHECKLIST' && (
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                      Pre-Flight Checklist items (one per line) required before executing trade:
                    </Typography>
                    <TextField
                      fullWidth
                      multiline
                      minRows={isModalMaximized ? 20 : 13}
                      value={checklistInput}
                      onChange={(e) => setChecklistInput(e.target.value)}
                      placeholder="1. Checklist rule 1&#10;2. Checklist rule 2..."
                    />
                  </Box>
                )}

                {modalActiveTab === 'VARIANTS' && renderVariantsManager()}
              </Box>
            )}
          </DialogContent>

          <DialogActions
            sx={{
              px: 3,
              py: 2,
              borderTop: `1px solid ${muiTheme.palette.divider}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              💡 Tip: Click the <strong>Maximize Studio</strong> button in the top-right corner to edit in distraction-free full screen.
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button onClick={() => setIsModalOpen(false)} color="inherit" disabled={saveMutation.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={saveMutation.isPending}
                startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null}
                sx={{ px: 3, fontWeight: 700 }}
              >
                {saveMutation.isPending ? 'Saving...' : editingStrategy ? 'Update Strategy' : 'Save Setup'}
              </Button>
            </Box>
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

      {/* Variant Add / Edit Dialog */}
      <Dialog
        open={isVariantModalOpen}
        onClose={() => setIsVariantModalOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          {editingVariantIndex !== null ? 'Edit Setup Variant' : 'New Child Setup Variant'}
        </DialogTitle>
        <form onSubmit={handleSaveVariant}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Variant Key *"
                  size="small"
                  fullWidth
                  required
                  placeholder="e.g. BULL-SSL-W-SWEEP, VAR-01"
                  value={variantKey}
                  onChange={(e) => setVariantKey(e.target.value.toUpperCase())}
                  helperText="Uppercase unique identifier within this strategy"
                  disabled={editingVariantIndex !== null}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Variant Name *"
                  size="small"
                  fullWidth
                  required
                  placeholder="e.g. W Pattern, Second-Leg Sweep"
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                />
              </Grid>
            </Grid>

            <TextField
              label="Description"
              size="small"
              fullWidth
              multiline
              rows={2}
              placeholder="Specific variant thesis, entry mechanics, or structural triggers..."
              value={variantDesc}
              onChange={(e) => setVariantDesc(e.target.value)}
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Expected Direction</InputLabel>
                  <Select
                    label="Expected Direction"
                    value={variantDirection}
                    onChange={(e) => setVariantDirection(e.target.value as any)}
                  >
                    <MenuItem value="">Any / Not Specified</MenuItem>
                    <MenuItem value="LONG">LONG</MenuItem>
                    <MenuItem value="SHORT">SHORT</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Min R:R Override"
                  size="small"
                  type="number"
                  fullWidth
                  placeholder="Inherit parent"
                  value={variantMinRR}
                  onChange={(e) => setVariantMinRR(e.target.value === '' ? '' : Number(e.target.value))}
                  slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Setup Matching Attributes (Optional)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Optional criteria used for automatic setup suggestion during trade journaling. Leave empty for general / discretionary variants.
              </Typography>
            </Box>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Pattern Type</InputLabel>
                  <Select
                    label="Pattern Type"
                    value={variantPatternType}
                    onChange={(e) => setVariantPatternType(e.target.value)}
                  >
                    <MenuItem value="">Not Specified</MenuItem>
                    <MenuItem value="W">W Pattern</MenuItem>
                    <MenuItem value="M">M Pattern</MenuItem>
                    <MenuItem value="EQUAL_LOWS">Equal Lows</MenuItem>
                    <MenuItem value="EQUAL_HIGHS">Equal Highs</MenuItem>
                    <MenuItem value="OTHER">Other Pattern</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Second Leg Status</InputLabel>
                  <Select
                    label="Second Leg Status"
                    value={variantSecondLegStatus}
                    onChange={(e) => setVariantSecondLegStatus(e.target.value)}
                  >
                    <MenuItem value="">Not Specified</MenuItem>
                    <MenuItem value="SWEPT">SWEPT (Sweeps first leg)</MenuItem>
                    <MenuItem value="UNSWEPT">UNSWEPT (Second leg stays higher/lower)</MenuItem>
                    <MenuItem value="NOT_APPLICABLE">Not Applicable</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Liquidity Side</InputLabel>
                  <Select
                    label="Liquidity Side"
                    value={variantLiquiditySide}
                    onChange={(e) => setVariantLiquiditySide(e.target.value)}
                  >
                    <MenuItem value="">Not Specified</MenuItem>
                    <MenuItem value="SELL_SIDE">Sell-Side Liquidity (SSL)</MenuItem>
                    <MenuItem value="BUY_SIDE">Buy-Side Liquidity (BSL)</MenuItem>
                    <MenuItem value="BOTH">Both Sides</MenuItem>
                    <MenuItem value="NONE">None / Untaken</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Entry Model</InputLabel>
                  <Select
                    label="Entry Model"
                    value={variantEntryModel}
                    onChange={(e) => setVariantEntryModel(e.target.value)}
                  >
                    <MenuItem value="">Not Specified</MenuItem>
                    <MenuItem value="CONFIRMATION_CANDLE">Confirmation Candle</MenuItem>
                    <MenuItem value="RETEST">Retest / Limit</MenuItem>
                    <MenuItem value="OTHER">Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>
              Variant Rule Overrides (Appended to Parent Rules)
            </Typography>

            <TextField
              label="Variant Entry Rules (one per line)"
              size="small"
              fullWidth
              multiline
              rows={2}
              placeholder="Specific entry trigger for this variant..."
              value={variantEntryRules}
              onChange={(e) => setVariantEntryRules(e.target.value)}
            />

            <TextField
              label="Variant Stop Loss Rules (one per line)"
              size="small"
              fullWidth
              multiline
              rows={2}
              placeholder="Specific stop loss rules for this variant..."
              value={variantStopLossRules}
              onChange={(e) => setVariantStopLossRules(e.target.value)}
            />

            <FormControlLabel
              control={<Switch checked={variantIsActive} onChange={(e) => setVariantIsActive(e.target.checked)} />}
              label="Active (Available in Trade Journal variant selector)"
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setIsVariantModalOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary">
              {editingVariantIndex !== null ? 'Update Variant' : 'Add Variant'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
