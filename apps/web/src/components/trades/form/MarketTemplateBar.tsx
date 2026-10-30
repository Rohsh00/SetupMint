import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  Chip,
  Typography,
  Popover,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Divider,
  useTheme,
  Tabs,
  Tab,
} from '@mui/material';
import {
  AutoAwesomeRounded,
  LayersRounded,
  CheckRounded,
  CloseRounded,
  RotateLeftRounded,
  InfoOutlined,
  CheckCircleOutlineRounded,
  KeyboardReturnRounded,
  TuneRounded,
} from '@mui/icons-material';
import {
  ITradeTemplate,
  BUILT_IN_TEMPLATES,
  TemplateGroup,
  TemplateContext,
  TemplatePatch,
  ProvenanceSource,
  AssetClass,
} from '@tradevault/shared';
import { rankTemplates, resolveTemplate } from '@tradevault/financial-engine';

export interface MarketTemplateBarProps {
  symbol?: string;
  assetClass?: AssetClass;
  direction?: 'LONG' | 'SHORT';
  entryPrice?: number;
  entryTime?: string | Date;
  tickSize?: number;
  lotSize?: number;
  contractMultiplier?: number;
  dirtyFields: Record<string, any>;
  strategies: any[];
  onApplyTemplatePatch: (patch: TemplatePatch, template: ITradeTemplate) => void;
  onUndoTemplate?: () => void;
  hasAppliedTemplate: boolean;
  appliedTemplateName?: string;
  userTemplates?: ITradeTemplate[];
}

export function MarketTemplateBar({
  symbol = '',
  assetClass = 'FUTURES',
  direction,
  entryPrice = 0,
  entryTime,
  tickSize = 0.05,
  lotSize = 1,
  contractMultiplier = 1,
  dirtyFields,
  strategies,
  onApplyTemplatePatch,
  onUndoTemplate,
  hasAppliedTemplate,
  appliedTemplateName,
  userTemplates = [],
}: MarketTemplateBarProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  // Merge built-in and user templates
  const allTemplates = useMemo(() => {
    return [...BUILT_IN_TEMPLATES, ...userTemplates];
  }, [userTemplates]);

  // Context for ranking
  const rankingContext: TemplateContext = useMemo(() => {
    return {
      symbol,
      assetClass,
      direction,
      entryPrice,
      entryTime: entryTime ? new Date(entryTime) : undefined,
      tickSize,
      lotSize,
      contractMultiplier,
    };
  }, [symbol, assetClass, direction, entryPrice, entryTime, tickSize, lotSize, contractMultiplier]);

  // Rank templates for the active market
  const rankedTemplates = useMemo(() => {
    return rankTemplates(allTemplates, rankingContext);
  }, [allTemplates, rankingContext]);

  // Top visible templates (max 6)
  const visibleTemplates = useMemo(() => {
    return rankedTemplates.slice(0, 6);
  }, [rankedTemplates]);

  // Preview Popover state
  const [previewAnchorEl, setPreviewAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<ITradeTemplate | null>(null);

  // "More Templates" picker dialog state
  const [isMoreModalOpen, setIsMoreModalOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<TemplateGroup | 'ALL'>('ALL');

  const handleOpenPreview = (template: ITradeTemplate, targetEl: HTMLElement) => {
    setSelectedTemplateForPreview(template);
    setPreviewAnchorEl(targetEl);
  };

  const handleClosePreview = () => {
    setPreviewAnchorEl(null);
    setSelectedTemplateForPreview(null);
  };

  // Compute preview patch
  const previewPatch: TemplatePatch | null = useMemo(() => {
    if (!selectedTemplateForPreview) return null;
    return resolveTemplate(selectedTemplateForPreview, {
      ...rankingContext,
      entryPrice: entryPrice > 0 ? entryPrice : undefined,
    });
  }, [selectedTemplateForPreview, rankingContext, entryPrice]);

  // Apply template action
  const handleApply = (template: ITradeTemplate) => {
    const patch = resolveTemplate(template, {
      ...rankingContext,
      entryPrice: entryPrice > 0 ? entryPrice : undefined,
    });
    onApplyTemplatePatch(patch, template);
    handleClosePreview();
    setIsMoreModalOpen(false);
  };

  // Keyboard shortcut listener (keys 1-6 when no text input is focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute('contenteditable') === 'true' ||
        activeEl?.getAttribute('role') === 'combobox';

      if (isInputActive) return;

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= visibleTemplates.length) {
        const targetTemplate = visibleTemplates[num - 1];
        if (targetTemplate) {
          e.preventDefault();
          // Find button or container for popover anchor
          const btnEl = document.getElementById(`template-chip-${targetTemplate.id}`);
          if (btnEl) {
            handleOpenPreview(targetTemplate, btnEl);
          } else {
            handleApply(targetTemplate);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleTemplates, rankingContext]);

  // Group label helper
  const getGroupLabel = (group: TemplateGroup): string => {
    switch (group) {
      case 'FNO':
        return 'F&O';
      case 'STOCKS':
        return 'Stocks';
      case 'FOREX_GOLD':
        return 'Forex & Gold';
      case 'CRYPTO':
        return 'Crypto';
      case 'MCX':
        return 'MCX';
      case 'PRICE_ACTION':
        return 'Price Action';
      default:
        return group;
    }
  };

  // Templates for the "More" modal grouped
  const modalTemplates = useMemo(() => {
    if (pickerTab === 'ALL') {
      return rankedTemplates;
    }
    return rankedTemplates.filter((t) => t.group === pickerTab);
  }, [rankedTemplates, pickerTab]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, my: 0.5 }}>
      {/* Template Header & Active Notice */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesomeRounded sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.6875rem',
              color: 'text.secondary',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Market Setup Templates ({assetClass}):
          </Typography>
        </Box>

        {/* Undo template button when applied */}
        {hasAppliedTemplate && onUndoTemplate && (
          <Button
            size="small"
            variant="text"
            color="warning"
            startIcon={<RotateLeftRounded sx={{ fontSize: 15 }} />}
            onClick={onUndoTemplate}
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              py: 0.25,
              px: 1,
              height: 24,
              borderRadius: 1.5,
              textTransform: 'none',
              bgcolor: isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)',
              '&:hover': {
                bgcolor: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.16)',
              },
            }}
          >
            Undo {appliedTemplateName ? `"${appliedTemplateName}"` : 'template'}
          </Button>
        )}
      </Box>

      {/* Chip Row of Ranked Templates (Max 6) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          flexWrap: 'wrap',
        }}
      >
        {visibleTemplates.map((template, idx) => {
          const isSelected = appliedTemplateName === template.name;
          return (
            <Tooltip
              key={template.id}
              title={`${template.description} (Press "${idx + 1}" when unfocused)`}
              arrow
            >
              <Chip
                id={`template-chip-${template.id}`}
                tabIndex={0}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography
                      component="span"
                      sx={{
                        fontSize: '0.625rem',
                        fontWeight: 800,
                        fontFamily: '"JetBrains Mono", monospace',
                        opacity: 0.65,
                        px: 0.5,
                        py: 0.1,
                        borderRadius: 0.75,
                        bgcolor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                      }}
                    >
                      {idx + 1}
                    </Typography>
                    <span>{template.name}</span>
                    {template.expiryDayOnly && (
                      <Typography
                        component="span"
                        sx={{
                          fontSize: '0.5625rem',
                          fontWeight: 800,
                          bgcolor: 'warning.main',
                          color: '#fff',
                          px: 0.5,
                          borderRadius: 0.5,
                        }}
                      >
                        EXPIRY
                      </Typography>
                    )}
                  </Box>
                }
                size="small"
                variant={isSelected ? 'filled' : 'outlined'}
                color={isSelected ? 'primary' : 'default'}
                onClick={(e) => handleOpenPreview(template, e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenPreview(template, e.currentTarget);
                  }
                }}
                sx={{
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: isSelected ? 700 : 600,
                  cursor: 'pointer',
                  borderColor: isSelected ? 'primary.main' : isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                  bgcolor: isSelected
                    ? undefined
                    : isDark
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'rgba(0, 0, 0, 0.02)',
                  '&:hover': {
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                    borderColor: 'primary.main',
                  },
                }}
              />
            </Tooltip>
          );
        })}

        {/* More Templates Chip */}
        {rankedTemplates.length > 6 && (
          <Chip
            icon={<LayersRounded sx={{ fontSize: 15 }} />}
            label={`More (${rankedTemplates.length - 6})`}
            size="small"
            variant="outlined"
            onClick={() => setIsMoreModalOpen(true)}
            sx={{
              height: 28,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'text.secondary',
              '&:hover': {
                bgcolor: 'action.hover',
                color: 'text.primary',
              },
            }}
          />
        )}
      </Box>

      {/* Template Preview Popover */}
      <Popover
        open={Boolean(previewAnchorEl) && Boolean(selectedTemplateForPreview)}
        anchorEl={previewAnchorEl}
        onClose={handleClosePreview}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        slotProps={{
          paper: {
            sx: {
              width: 340,
              p: 2,
              borderRadius: 2.5,
              boxShadow: isDark
                ? '0 12px 32px rgba(0, 0, 0, 0.6)'
                : '0 12px 32px rgba(0, 0, 0, 0.12)',
              backgroundImage: 'none',
              border: 1,
              borderColor: 'divider',
            },
          },
        }}
      >
        {selectedTemplateForPreview && previewPatch && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.875rem' }}>
                    {selectedTemplateForPreview.name}
                  </Typography>
                  <Chip
                    label={getGroupLabel(selectedTemplateForPreview.group)}
                    size="small"
                    sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.75rem' }}>
                  {selectedTemplateForPreview.description}
                </Typography>
              </Box>
              <IconButton size="small" onClick={handleClosePreview} sx={{ p: 0.5, mt: -0.5, mr: -0.5 }}>
                <CloseRounded sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>

            <Divider />

            {/* Preview of what will be filled */}
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.6875rem' }}>
              WILL PREFILL (EMPTY FIELDS ONLY):
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.75rem' }}>
              {/* Title preview */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', width: 70, flexShrink: 0, fontWeight: 600 }}>
                  Title:
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
                  {previewPatch.tradeTitle || 'Auto-generated title'}
                </Typography>
              </Box>

              {/* Tags */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', width: 70, flexShrink: 0, fontWeight: 600 }}>
                  Tags:
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.primary' }}>
                  {previewPatch.tags?.join(', ') || 'None'}
                </Typography>
              </Box>

              {/* Strategy */}
              {selectedTemplateForPreview.strategyName && (
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', width: 70, flexShrink: 0, fontWeight: 600 }}>
                    Strategy:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                    {selectedTemplateForPreview.strategyName}
                  </Typography>
                </Box>
              )}

              {/* Stop Loss & Target rule description */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', width: 70, flexShrink: 0, fontWeight: 600 }}>
                  SL / Target:
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 600 }}>
                  {selectedTemplateForPreview.slRule.type === 'MANUAL'
                    ? 'Manual structure SL (hint provided)'
                    : selectedTemplateForPreview.slRule.type === 'POINTS'
                    ? `${selectedTemplateForPreview.slRule.value} pts SL • 1:${selectedTemplateForPreview.minRR} R:R`
                    : selectedTemplateForPreview.slRule.type === 'PREMIUM_PERCENT'
                    ? `${selectedTemplateForPreview.slRule.value}% premium SL • 1:${selectedTemplateForPreview.minRR} R:R`
                    : `${selectedTemplateForPreview.slRule.value}% SL • 1:${selectedTemplateForPreview.minRR} R:R target`}
                </Typography>
              </Box>

              {/* Confluences & Checklist */}
              {(selectedTemplateForPreview.confluences?.length || 0) > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', width: 70, flexShrink: 0, fontWeight: 600 }}>
                    Confluences:
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedTemplateForPreview.confluences?.join(', ')}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Note about dirty fields */}
            <Typography variant="caption" sx={{ fontSize: '0.625rem', color: 'text.secondary', fontStyle: 'italic', bgcolor: 'action.hover', p: 0.75, borderRadius: 1.5 }}>
              Untouched fields will fill. Any field you already typed or edited will NOT be overwritten.
            </Typography>

            {/* Actions */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 0.5 }}>
              <Button size="small" variant="text" color="inherit" onClick={handleClosePreview} sx={{ textTransform: 'none', fontWeight: 600 }}>
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={<CheckRounded sx={{ fontSize: 16 }} />}
                onClick={() => handleApply(selectedTemplateForPreview)}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}
              >
                Apply Setup
              </Button>
            </Box>
          </Box>
        )}
      </Popover>

      {/* "More Templates" Full Grouped Picker Dialog */}
      <Dialog
        open={isMoreModalOpen}
        onClose={() => setIsMoreModalOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2.5,
              backgroundImage: 'none',
              maxHeight: 600,
            },
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Market Setup Library ({assetClass})
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Select an institutional setup to auto-configure strategy, checklist, and risk rules
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setIsMoreModalOpen(false)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <Divider />

        {/* Group Tabs */}
        <Box sx={{ px: 2, pt: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={pickerTab}
            onChange={(_, val) => setPickerTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 36 }}
          >
            <Tab label="All Ranked" value="ALL" sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.8125rem', fontWeight: 700 }} />
            <Tab label="F&O" value="FNO" sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.8125rem', fontWeight: 700 }} />
            <Tab label="Stocks" value="STOCKS" sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.8125rem', fontWeight: 700 }} />
            <Tab label="Forex & Gold" value="FOREX_GOLD" sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.8125rem', fontWeight: 700 }} />
            <Tab label="Crypto" value="CRYPTO" sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.8125rem', fontWeight: 700 }} />
            <Tab label="MCX" value="MCX" sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.8125rem', fontWeight: 700 }} />
            <Tab label="Price Action" value="PRICE_ACTION" sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.8125rem', fontWeight: 700 }} />
          </Tabs>
        </Box>

        <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {modalTemplates.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No templates in this category support {assetClass}.
              </Typography>
            </Box>
          ) : (
            modalTemplates.map((template) => (
              <Box
                key={template.id}
                onClick={() => handleApply(template)}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease-in-out',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)',
                  },
                }}
              >
                <Box sx={{ pr: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {template.name}
                    </Typography>
                    <Chip label={getGroupLabel(template.group)} size="small" sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }} />
                    {template.direction && (
                      <Chip
                        label={template.direction}
                        size="small"
                        color={template.direction === 'LONG' ? 'success' : 'error'}
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
                      />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    {template.description}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                    Rule: {template.slRule.type} ({template.slRule.value ? `${template.slRule.value}%` : 'Manual'}) • R:R: 1:{template.minRR}
                    {template.strategyName ? ` • Strategy: ${template.strategyName}` : ''}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5, flexShrink: 0 }}
                >
                  Apply
                </Button>
              </Box>
            ))
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
