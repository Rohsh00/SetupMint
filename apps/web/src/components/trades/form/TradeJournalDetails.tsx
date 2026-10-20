import React, { useState } from 'react';
import { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  FormControlLabel,
  Checkbox,
  Slider,
  Card,
  Grid,
  useTheme,
  Collapse,
  Tooltip,
  IconButton,
  Button,
  InputAdornment,
} from '@mui/material';
import {
  TrendingUpRounded,
  TrendingDownRounded,
  PsychologyRounded,
  CheckCircleRounded,
  WarningAmberRounded,
  AutoAwesomeRounded,
  MenuBookRounded,
  ExpandMoreRounded,
  CheckRounded,
  CloseRounded,
  SearchRounded,
  ClearRounded,
  WaterDropRounded,
  ViewDayRounded,
  AccountTreeRounded,
  TimelineRounded,
} from '@mui/icons-material';
import {
  CONFLUENCES,
  CONFLUENCE_LABEL_MAP,
  EMOTIONS,
  MISTAKE_TAGS,
  ConfluenceCategory,
} from '@tradevault/shared';

interface TradeJournalDetailsProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}

const CONFLUENCE_PANELS: {
  category: ConfluenceCategory;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}[] = [
  {
    category: 'LIQUIDITY',
    title: '1. Liquidity Sweeps & Resting Pools',
    subtitle: 'Sweeps, stop hunts, equal highs/lows, session/day extremes & voids',
    icon: <WaterDropRounded sx={{ fontSize: 16 }} />,
  },
  {
    category: 'SUPPORT_RESISTANCE',
    title: '2. Support / Resistance & Key Levels',
    subtitle: 'HTF key levels, S/R polarity flips, order blocks, demand/supply & OI walls',
    icon: <ViewDayRounded sx={{ fontSize: 16 }} />,
  },
  {
    category: 'CONFIRMATION_STRUCTURE',
    title: '3. Confirmation & Market Structure',
    subtitle: 'BOS, CHOCH, structure shifts, displacement candles & mitigation blocks',
    icon: <AccountTreeRounded sx={{ fontSize: 16 }} />,
  },
  {
    category: 'INDICATORS_OTHER',
    title: '4. Indicators & Dynamic Levels',
    subtitle: 'Moving average crosses, RSI divergences, VWAP bounces & volume profiles',
    icon: <TimelineRounded sx={{ fontSize: 16 }} />,
  },
];

export function TradeJournalDetails({
  register,
  watch,
  setValue,
}: TradeJournalDetailsProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const preMarketBias = watch('thesis.preMarketBias') || 'BULLISH';
  const marketStructure = watch('thesis.marketStructure') || 'TRENDING_UP';
  const selectedConfluences: string[] = watch('thesis.confluences') || [];
  const disciplineScore = watch('psychology.disciplineScore') ?? 4;
  const selectedMistakes: string[] = watch('psychology.mistakes') || [];

  // Accordion state: 1. Liquidity Sweeps expanded by default, others collapsed. Multi-expansion allowed.
  const [expandedConfluencePanels, setExpandedConfluencePanels] = useState<Record<string, boolean>>({
    LIQUIDITY: true,
    SUPPORT_RESISTANCE: false,
    CONFIRMATION_STRUCTURE: false,
    INDICATORS_OTHER: false,
  });
  const [confluenceSearch, setConfluenceSearch] = useState('');

  const toggleConfluencePanel = (category: string) => {
    setExpandedConfluencePanels((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleExpandAllConfluences = () => {
    setExpandedConfluencePanels({
      LIQUIDITY: true,
      SUPPORT_RESISTANCE: true,
      CONFIRMATION_STRUCTURE: true,
      INDICATORS_OTHER: true,
    });
  };

  const handleCollapseAllConfluences = () => {
    setExpandedConfluencePanels({
      LIQUIDITY: false,
      SUPPORT_RESISTANCE: false,
      CONFIRMATION_STRUCTURE: false,
      INDICATORS_OTHER: false,
    });
  };

  const handleClearAllConfluences = () => {
    setValue('thesis.confluences', []);
  };

  const handleToggleConfluence = (item: string) => {
    if (selectedConfluences.includes(item)) {
      setValue('thesis.confluences', selectedConfluences.filter((c) => c !== item));
    } else {
      setValue('thesis.confluences', [...selectedConfluences, item]);
    }
  };

  const handleToggleMistake = (tag: string) => {
    if (selectedMistakes.includes(tag)) {
      setValue('psychology.mistakes', selectedMistakes.filter((m) => m !== tag));
    } else {
      setValue('psychology.mistakes', [...selectedMistakes, tag]);
    }
  };

  const disciplineLabels: Record<number, string> = {
    1: '1 - Impulsive / Tilt',
    2: '2 - Hesitant / Fearful',
    3: '3 - Acceptable Execution',
    4: '4 - Strong Rule Adherence',
    5: '5 - Flawless Execution',
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* SECTION 1: THESIS & MARKET CONTEXT */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesomeRounded sx={{ color: 'primary.main', fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Market Context & Trade Thesis
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {/* Pre-Market Bias */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.75 }}>
              Pre-Market Bias
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={preMarketBias}
              onChange={(_, val) => val && setValue('thesis.preMarketBias', val)}
            >
              <ToggleButton value="BULLISH" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                BULLISH
              </ToggleButton>
              <ToggleButton value="NEUTRAL" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                NEUTRAL
              </ToggleButton>
              <ToggleButton value="BEARISH" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                BEARISH
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Market Structure */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.75 }}>
              Market Structure
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              value={marketStructure}
              onChange={(e) => setValue('thesis.marketStructure', e.target.value)}
            >
              <MenuItem value="TRENDING_UP">TRENDING UP (Higher Highs / Higher Lows)</MenuItem>
              <MenuItem value="TRENDING_DOWN">TRENDING DOWN (Lower Highs / Lower Lows)</MenuItem>
              <MenuItem value="RANGING">RANGING / CONSOLIDATION</MenuItem>
              <MenuItem value="VOLATILE">VOLATILE / EXPANDING RANGE</MenuItem>
            </TextField>
          </Box>
        </Box>

        {/* Technical Confluences & Setup Confirmation Accordion Interface */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Selected Items Summary Bar (Top Level) */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: selectedConfluences.length > 0
                ? isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.3)'
                : 'divider',
              bgcolor: selectedConfluences.length > 0
                ? isDark ? 'rgba(16, 185, 129, 0.04)' : 'rgba(16, 185, 129, 0.02)'
                : isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.01)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary', fontSize: '0.6875rem' }}>
                  Technical Confluences & Setup Confirmation
                </Typography>
                <Box
                  sx={{
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    fontFamily: `'JetBrains Mono', monospace`,
                    bgcolor: selectedConfluences.length > 0
                      ? isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)'
                      : 'action.hover',
                    color: selectedConfluences.length > 0
                      ? isDark ? '#34d399' : '#059669'
                      : 'text.secondary',
                    border: '1px solid',
                    borderColor: selectedConfluences.length > 0
                      ? isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.35)'
                      : 'divider',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Total Confluences: {selectedConfluences.length}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* Instant Search Filter */}
                <TextField
                  size="small"
                  placeholder="Search sweeps, levels, CHOCH..."
                  value={confluenceSearch}
                  onChange={(e) => setConfluenceSearch(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRounded sx={{ fontSize: 16, color: 'text.secondary' }} />
                        </InputAdornment>
                      ),
                      endAdornment: confluenceSearch ? (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setConfluenceSearch('')} sx={{ p: 0.25 }}>
                            <ClearRounded sx={{ fontSize: 13 }} />
                          </IconButton>
                        </InputAdornment>
                      ) : null,
                      sx: {
                        fontSize: '0.75rem',
                        height: 28,
                        width: { xs: 160, sm: 220 },
                        borderRadius: 1.5,
                        bgcolor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      },
                    },
                  }}
                />

                {/* Multi-Accordion Expand/Collapse Toggle */}
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    const allOpen = Object.values(expandedConfluencePanels).every(Boolean);
                    if (allOpen) {
                      handleCollapseAllConfluences();
                    } else {
                      handleExpandAllConfluences();
                    }
                  }}
                  sx={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    minWidth: 0,
                    px: 1,
                    py: 0.5,
                    color: 'text.secondary',
                    textTransform: 'none',
                    borderRadius: 1,
                  }}
                >
                  {Object.values(expandedConfluencePanels).every(Boolean) ? 'Collapse All' : 'Expand All'}
                </Button>

                {/* Clear All */}
                {selectedConfluences.length > 0 && (
                  <Button
                    size="small"
                    variant="text"
                    color="error"
                    onClick={handleClearAllConfluences}
                    sx={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      minWidth: 0,
                      px: 1,
                      py: 0.5,
                      textTransform: 'none',
                      borderRadius: 1,
                    }}
                  >
                    Clear All
                  </Button>
                )}
              </Box>
            </Box>

            {/* Active Tags Removable Tray */}
            {selectedConfluences.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 0.75,
                  pt: 0.75,
                  borderTop: '1px dashed',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.6875rem', mr: 0.5 }}>
                  Active Selected ({selectedConfluences.length}):
                </Typography>
                {selectedConfluences.map((val) => {
                  const confObj = CONFLUENCES.find((c) => c.value === val);
                  const label = confObj?.label || CONFLUENCE_LABEL_MAP[val] || val;
                  return (
                    <Chip
                      key={val}
                      label={label}
                      size="small"
                      onDelete={() => handleToggleConfluence(val)}
                      deleteIcon={<CloseRounded sx={{ fontSize: 13 }} />}
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.71875rem',
                        height: 24,
                        bgcolor: isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.15)',
                        color: isDark ? '#34d399' : '#047857',
                        border: '1px solid',
                        borderColor: isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.35)',
                        '& .MuiChip-deleteIcon': {
                          color: isDark ? '#34d399' : '#047857',
                          '&:hover': {
                            color: isDark ? '#f87171' : '#dc2626',
                          },
                        },
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </Box>

          {/* Accordion Panels for 4 Categories */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {CONFLUENCE_PANELS.map((grp) => {
              const items = CONFLUENCES.filter(
                (c) =>
                  c.category === grp.category &&
                  (!confluenceSearch ||
                    c.label.toLowerCase().includes(confluenceSearch.toLowerCase()) ||
                    c.value.toLowerCase().includes(confluenceSearch.toLowerCase()) ||
                    (c.description && c.description.toLowerCase().includes(confluenceSearch.toLowerCase())))
              );

              // Auto-expand if search query has matches in this group
              const isSearching = Boolean(confluenceSearch.trim());
              const isExpanded = isSearching ? items.length > 0 : Boolean(expandedConfluencePanels[grp.category]);
              const groupSelectedCount = CONFLUENCES.filter((c) => c.category === grp.category && selectedConfluences.includes(c.value)).length;

              if (isSearching && items.length === 0) return null;

              return (
                <Box
                  key={grp.category}
                  sx={{
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: isExpanded
                      ? isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.14)'
                      : 'divider',
                    bgcolor: isExpanded
                      ? isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)'
                      : isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.005)',
                    overflow: 'hidden',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {/* Accordion Header */}
                  <Box
                    onClick={() => toggleConfluencePanel(grp.category)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1.35,
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color 0.15s ease',
                      '&:hover': {
                        bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                      <Box
                        sx={{
                          color: groupSelectedCount > 0 ? (isDark ? '#34d399' : '#059669') : 'text.secondary',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          p: 0.5,
                          borderRadius: 1,
                          bgcolor: groupSelectedCount > 0
                            ? isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)'
                            : 'transparent',
                          transition: 'color 0.15s ease',
                        }}
                      >
                        {grp.icon}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.8125rem',
                            color: isExpanded ? 'text.primary' : 'text.secondary',
                            letterSpacing: '0.01em',
                          }}
                        >
                          {grp.title}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            fontSize: '0.6875rem',
                            display: { xs: 'none', sm: 'block' },
                            opacity: 0.75,
                          }}
                        >
                          {grp.subtitle}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, shrink: 0 }}>
                      {/* Dynamic Count Badge */}
                      <Box
                        sx={{
                          px: 1,
                          py: 0.35,
                          borderRadius: 1,
                          fontSize: '0.6875rem',
                          fontWeight: groupSelectedCount > 0 ? 700 : 500,
                          fontFamily: `'JetBrains Mono', monospace`,
                          bgcolor: groupSelectedCount > 0
                            ? isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)'
                            : isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                          color: groupSelectedCount > 0
                            ? isDark ? '#34d399' : '#059669'
                            : 'text.secondary',
                          border: '1px solid',
                          borderColor: groupSelectedCount > 0
                            ? isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.3)'
                            : 'divider',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {groupSelectedCount > 0 ? `${groupSelectedCount} Selected` : '0 Selected'}
                      </Box>

                      {/* Smooth Rotating Chevron */}
                      <ExpandMoreRounded
                        sx={{
                          fontSize: 18,
                          color: 'text.secondary',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      />
                    </Box>
                  </Box>

                  {/* Accordion Body with Smooth Animation */}
                  <Collapse in={isExpanded} timeout={220} unmountOnExit={false}>
                    <Box
                      sx={{
                        p: 1.5,
                        pt: 0.5,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        bgcolor: isDark ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.5)',
                      }}
                    >
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {items.map((conf) => {
                          const isChecked = selectedConfluences.includes(conf.value);
                          return (
                            <Tooltip
                              key={conf.value}
                              title={conf.description || conf.label}
                              arrow
                              placement="top"
                            >
                              <Box
                                component="button"
                                type="button"
                                onClick={() => handleToggleConfluence(conf.value)}
                                sx={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 0.75,
                                  px: 1.25,
                                  py: 0.75,
                                  borderRadius: 1.5,
                                  border: '1px solid',
                                  borderColor: isChecked
                                    ? isDark ? 'rgba(16, 185, 129, 0.6)' : 'rgba(16, 185, 129, 0.7)'
                                    : isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                                  bgcolor: isChecked
                                    ? isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.14)'
                                    : isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                                  color: isChecked
                                    ? isDark ? '#34d399' : '#047857'
                                    : 'text.secondary',
                                  fontWeight: isChecked ? 700 : 500,
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                                  boxShadow: isChecked ? '0 1px 3px rgba(16, 185, 129, 0.15)' : 'none',
                                  '&:hover': {
                                    bgcolor: isChecked
                                      ? isDark ? 'rgba(16, 185, 129, 0.28)' : 'rgba(16, 185, 129, 0.2)'
                                      : isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                                    borderColor: isChecked
                                      ? isDark ? '#34d399' : '#059669'
                                      : 'text.primary',
                                    color: isChecked
                                      ? isDark ? '#6ee7b7' : '#065f46'
                                      : 'text.primary',
                                    transform: 'translateY(-1px)',
                                  },
                                  '&:active': {
                                    transform: 'translateY(0)',
                                  },
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: '3px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    fontWeight: 900,
                                    bgcolor: isChecked ? (isDark ? '#10b981' : '#059669') : 'transparent',
                                    color: isChecked ? '#ffffff' : 'transparent',
                                    border: '1px solid',
                                    borderColor: isChecked
                                      ? isDark ? '#10b981' : '#059669'
                                      : isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  {isChecked && '✓'}
                                </Box>
                                <span>{conf.label}</span>
                              </Box>
                            </Tooltip>
                          );
                        })}
                      </Box>
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Entry & Exit Rationale */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField
            label="Entry Rationale & Setup Details"
            multiline
            rows={2.5}
            fullWidth
            placeholder="Describe what triggered execution: e.g. 5m liquidity sweep of PDH, order block tap, volume confirmation..."
            value={watch('thesis.entryRationale') || ''}
            onChange={(e) => setValue('thesis.entryRationale', e.target.value)}
          />

          <TextField
            label="Exit Rationale & Post-Trade Notes"
            multiline
            rows={2.5}
            fullWidth
            placeholder="Why was the trade closed: target reached, trailing stop hit, momentum exhausted, invalidation..."
            value={watch('thesis.exitRationale') || ''}
            onChange={(e) => setValue('thesis.exitRationale', e.target.value)}
          />
        </Box>
      </Box>

      {/* SECTION 2: PSYCHOLOGY & DISCIPLINE AUDIT */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PsychologyRounded sx={{ color: 'primary.main', fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Psychology, Mindset & Execution Discipline
          </Typography>
        </Box>

        {/* Emotions across trade stages (Positive/Neutral/Negative groups) */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
          {['Before', 'During', 'After'].map((stage) => {
            const field = `psychology.emotion${stage}`;
            const label = `Emotion ${stage === 'Before' ? 'Before Entry' : stage === 'During' ? 'During Trade' : 'After Exit'}`;
            const currentVal = watch(field) || (stage === 'Before' ? 'CALM' : stage === 'During' ? 'CONFIDENT' : 'DISCIPLINED');

            return (
              <TextField
                key={field}
                select
                size="small"
                label={label}
                fullWidth
                value={currentVal}
                onChange={(e) => setValue(field, e.target.value)}
              >
                <MenuItem disabled sx={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase' }}>
                  ── Positive & Disciplined ──
                </MenuItem>
                {EMOTIONS.filter((e) => e.category === 'POSITIVE').map((em) => (
                  <MenuItem key={em.value} value={em.value}>
                    {em.label}
                  </MenuItem>
                ))}
                <MenuItem disabled sx={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase' }}>
                  ── Neutral & Routine ──
                </MenuItem>
                {EMOTIONS.filter((e) => e.category === 'NEUTRAL').map((em) => (
                  <MenuItem key={em.value} value={em.value}>
                    {em.label}
                  </MenuItem>
                ))}
                <MenuItem disabled sx={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase' }}>
                  ── Negative & Reactive ──
                </MenuItem>
                {EMOTIONS.filter((e) => e.category === 'NEGATIVE').map((em) => (
                  <MenuItem key={em.value} value={em.value}>
                    {em.label}
                  </MenuItem>
                ))}
              </TextField>
            );
          })}
        </Box>

        {/* Discipline Rating Selector */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: 'action.hover',
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary' }}>
              Execution Discipline Rating
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main', fontFamily: '"JetBrains Mono", monospace' }}>
              {disciplineLabels[disciplineScore] || `${disciplineScore} / 5`}
            </Typography>
          </Box>

          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={disciplineScore}
            onChange={(_, val) => val && setValue('psychology.disciplineScore', val)}
          >
            {[1, 2, 3, 4, 5].map((score) => (
              <ToggleButton
                key={score}
                value={score}
                sx={{
                  fontWeight: 800,
                  fontFamily: '"JetBrains Mono", monospace',
                  py: 0.75,
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    '&:hover': { bgcolor: 'primary.dark' },
                  },
                }}
              >
                {score} ★
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {/* Rule Adherence Checkboxes */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(watch('psychology.rulesFollowed'))}
                onChange={(e) => setValue('psychology.rulesFollowed', e.target.checked)}
                color="primary"
                size="small"
              />
            }
            label={<Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>Followed All Trading Rules & Plan</Typography>}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(watch('psychology.checklistCompleted'))}
                onChange={(e) => setValue('psychology.checklistCompleted', e.target.checked)}
                color="primary"
                size="small"
              />
            }
            label={<Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>Completed Pre-Trade Checklist</Typography>}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(watch('psychology.revengeTrading'))}
                onChange={(e) => setValue('psychology.revengeTrading', e.target.checked)}
                color="error"
                size="small"
              />
            }
            label={<Typography variant="body2" sx={{ fontSize: '0.8125rem', color: watch('psychology.revengeTrading') ? 'error.main' : 'inherit' }}>Revenge Trading Behavior</Typography>}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(watch('psychology.prematureExit'))}
                onChange={(e) => setValue('psychology.prematureExit', e.target.checked)}
                color="error"
                size="small"
              />
            }
            label={<Typography variant="body2" sx={{ fontSize: '0.8125rem', color: watch('psychology.prematureExit') ? 'error.main' : 'inherit' }}>Exited Prematurely Before Invalidation</Typography>}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(watch('psychology.stopLossMoved'))}
                onChange={(e) => setValue('psychology.stopLossMoved', e.target.checked)}
                color="error"
                size="small"
              />
            }
            label={<Typography variant="body2" sx={{ fontSize: '0.8125rem', color: watch('psychology.stopLossMoved') ? 'error.main' : 'inherit' }}>Moved Stop Loss Further Away</Typography>}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(watch('psychology.positionSizeViolation'))}
                onChange={(e) => setValue('psychology.positionSizeViolation', e.target.checked)}
                color="error"
                size="small"
              />
            }
            label={<Typography variant="body2" sx={{ fontSize: '0.8125rem', color: watch('psychology.positionSizeViolation') ? 'error.main' : 'inherit' }}>Exceeded Position Sizing Limits</Typography>}
          />
        </Box>

        {/* Behavioral Mistakes Chips (Grouped by Category) */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Execution Mistakes & Psychological Deviations ({selectedMistakes.length} tagged)
            </Typography>
          </Box>

          {[
            { cat: 'LIQUIDITY_LEVEL', title: '1. Liquidity & Structural Levels (S/R)' },
            { cat: 'EXECUTION_TIMING', title: '2. Execution & Entry Timing' },
            { cat: 'RISK_DISCIPLINE', title: '3. Risk Management & Discipline' },
            { cat: 'SESSION_CONTEXT', title: '4. Session & Macro Context' },
          ].map((grp) => {
            const items = MISTAKE_TAGS.filter((m) => m.category === grp.cat);
            return (
              <Box
                key={grp.cat}
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontSize: '0.6875rem',
                    color: 'text.secondary',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  {grp.title}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {items.map((tag) => {
                    const isChecked = selectedMistakes.includes(tag.value);
                    return (
                      <Chip
                        key={tag.value}
                        label={tag.label}
                        size="small"
                        onClick={() => handleToggleMistake(tag.value)}
                        variant={isChecked ? 'filled' : 'outlined'}
                        color={isChecked ? 'error' : 'default'}
                        sx={{
                          fontWeight: isChecked ? 700 : 500,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      />
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* Lessons Learned */}
        <TextField
          label="Key Lessons Learned & Takeaways"
          multiline
          rows={2}
          fullWidth
          placeholder="What would you do differently next time? How can this setup be refined?"
          value={watch('psychology.lessonsLearned') || ''}
          onChange={(e) => setValue('psychology.lessonsLearned', e.target.value)}
        />
      </Box>
    </Box>
  );
}
