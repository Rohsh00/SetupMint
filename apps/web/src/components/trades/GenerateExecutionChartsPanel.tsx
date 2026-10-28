import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  Grid,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Autocomplete,
  TextField,
  FormControlLabel,
  Switch,
  Checkbox,
  CircularProgress,
  Alert,
  Tooltip,
  Paper,
  Divider,
  useTheme,
} from '@mui/material';
import {
  ElectricBoltRounded,
  AccessTimeRounded,
  CheckCircleRounded,
  CancelRounded,
  WarningAmberRounded,
  SyncRounded,
  TuneRounded,
  InfoOutlined,
  LayersRounded,
  ShowChartRounded,
} from '@mui/icons-material';
import {
  CHART_RESOLUTIONS,
  CHART_RESOLUTION_LABELS,
  DEFAULT_CHART_PADDING_CANDLES,
  MAX_CHART_PADDING_CANDLES,
  CHART_PADDING_PRESETS,
  MAX_CHART_TIMEFRAMES_PER_REQUEST,
  IAttachment,
  IChartGenerateResult,
  ChartResolution,
} from '@tradevault/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { toast } from '../../context/ToastContext.js';
import { HelpHint } from '../help/index.js';
import { InteractiveTradingViewModal } from './attachments/InteractiveTradingViewModal.js';

const PREF_TIMEFRAMES_KEY = 'tradevault_chart_timeframes';
const PREF_PADDING_BEFORE_KEY = 'tradevault_chart_padding_before';
const PREF_PADDING_AFTER_KEY = 'tradevault_chart_padding_after';
const PREF_SAME_PADDING_KEY = 'tradevault_chart_same_padding';

const TIMEFRAME_OPTIONS = ['Auto', '1m', '5m', '15m', '30m', '1h', '4h', '1D'] as const;
type TimeframeOption = typeof TIMEFRAME_OPTIONS[number];

// Label to API resolution mapping
const LABEL_TO_RESOLUTION: Record<string, ChartResolution> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1D': 'D',
};

// Resolution to label mapping
const RESOLUTION_TO_LABEL: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '240': '4h',
  'D': '1D',
};

interface GenerateExecutionChartsPanelProps {
  tradeId: string;
  symbol: string;
  status: string; // 'OPEN' | 'CLOSED'
  entryDate?: string | Date;
  exitDate?: string | Date;
  attachments?: IAttachment[];
  onGenerated?: () => void;
}

export function GenerateExecutionChartsPanel({
  tradeId,
  symbol,
  status,
  entryDate,
  exitDate,
  attachments = [],
  onGenerated,
}: GenerateExecutionChartsPanelProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const queryClient = useQueryClient();

  // Load preferences from localStorage with safe fallbacks
  const [selectedTimeframes, setSelectedTimeframes] = useState<TimeframeOption[]>(() => {
    try {
      const saved = localStorage.getItem(PREF_TIMEFRAMES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((t: any) => TIMEFRAME_OPTIONS.includes(t));
          if (valid.length > 0) return valid;
        }
      }
    } catch {
      // fallback
    }
    return ['5m', '15m'];
  });

  const [sameOnBothSides, setSameOnBothSides] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(PREF_SAME_PADDING_KEY);
      if (saved !== null) return saved === 'true';
    } catch {
      // fallback
    }
    return true;
  });

  const [paddingBefore, setPaddingBefore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(PREF_PADDING_BEFORE_KEY);
      if (saved !== null) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 0 && val <= MAX_CHART_PADDING_CANDLES) return val;
      }
    } catch {
      // fallback
    }
    return DEFAULT_CHART_PADDING_CANDLES;
  });

  const [paddingAfter, setPaddingAfter] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(PREF_PADDING_AFTER_KEY);
      if (saved !== null) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 0 && val <= MAX_CHART_PADDING_CANDLES) return val;
      }
    } catch {
      // fallback
    }
    return DEFAULT_CHART_PADDING_CANDLES;
  });

  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [lastResults, setLastResults] = useState<IChartGenerateResult[] | null>(null);
  const [interactiveModalOpen, setInteractiveModalOpen] = useState(false);

  // Save preferences whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(PREF_TIMEFRAMES_KEY, JSON.stringify(selectedTimeframes));
    } catch {
      // ignore
    }
  }, [selectedTimeframes]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_SAME_PADDING_KEY, String(sameOnBothSides));
    } catch {
      // ignore
    }
  }, [sameOnBothSides]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_PADDING_BEFORE_KEY, String(paddingBefore));
    } catch {
      // ignore
    }
  }, [paddingBefore]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_PADDING_AFTER_KEY, String(paddingAfter));
    } catch {
      // ignore
    }
  }, [paddingAfter]);

  // Provider Connection Queries (FYERS & Angel One)
  const { data: fyersStatus, isLoading: isFyersLoading } = useQuery({
    queryKey: ['fyers-status'],
    queryFn: () => api.integrations.fyersStatus(),
    staleTime: 60_000,
  });

  const { data: angelOneStatus, isLoading: isAngelOneLoading } = useQuery({
    queryKey: ['angel-one-status'],
    queryFn: () => api.marketData.angelOne.status(),
    staleTime: 60_000,
  });

  const fyersData = (fyersStatus as any)?.data ?? fyersStatus;
  const isFyersConnected = Boolean(fyersData?.isConnected || fyersData?.status === 'CONNECTED');

  const angelOneData = (angelOneStatus as any)?.data ?? angelOneStatus;
  const isAngelOneConnected = Boolean(
    (angelOneData?.connected && !angelOneData?.isTokenExpired) ||
    angelOneData?.status === 'CONNECTED' ||
    angelOneData?.isConnected
  );

  const isMarketDataConnected = isFyersConnected || isAngelOneConnected;
  const isStatusChecking = !isMarketDataConnected && (isFyersLoading || isAngelOneLoading);
  const isClosedTrade = status === 'CLOSED';

  // Existing AUTO_CHART count & slot calculation
  const totalAttachmentsCount = attachments.length;
  const existingAutoCharts = useMemo(
    () => attachments.filter((a) => a.category === 'AUTO_CHART'),
    [attachments]
  );
  const existingAutoChartTimeframes = useMemo(
    () => new Set(existingAutoCharts.map((a) => a.timeframe || a.chartMeta?.resolution || '')),
    [existingAutoCharts]
  );

  // Calculate net new slots needed
  const netNewSlotsNeeded = useMemo(() => {
    if (selectedTimeframes.includes('Auto')) {
      // In Auto mode, produces 1 chart
      if (replaceExisting) return 0;
      return existingAutoCharts.length > 0 ? 0 : 1;
    }
    if (replaceExisting) {
      // Replacements are net-zero for timeframes that already exist, +1 for ones that don't
      let newSlots = 0;
      for (const tf of selectedTimeframes) {
        if (!existingAutoChartTimeframes.has(tf)) {
          newSlots++;
        }
      }
      return newSlots;
    }
    // Without replace, only timeframes that don't already exist will be generated
    let newSlots = 0;
    for (const tf of selectedTimeframes) {
      if (!existingAutoChartTimeframes.has(tf)) {
        newSlots++;
      }
    }
    return newSlots;
  }, [selectedTimeframes, replaceExisting, existingAutoCharts, existingAutoChartTimeframes]);

  const wouldExceedLimit = totalAttachmentsCount + netNewSlotsNeeded > 12;

  // Handle Timeframe Multi-Select with Auto exclusivity and Max 5
  const handleTimeframeChange = (newValues: string[]) => {
    if (newValues.length === 0) {
      setSelectedTimeframes([]);
      return;
    }

    const clickedItem = newValues[newValues.length - 1] as TimeframeOption;

    if (clickedItem === 'Auto') {
      // Auto is mutually exclusive with explicit options
      setSelectedTimeframes(['Auto']);
      return;
    }

    // If explicit option clicked, remove 'Auto' if present
    const withoutAuto = newValues.filter((v) => v !== 'Auto') as TimeframeOption[];

    // Enforce max 5 selections
    if (withoutAuto.length > MAX_CHART_TIMEFRAMES_PER_REQUEST) {
      toast.warning(`Maximum ${MAX_CHART_TIMEFRAMES_PER_REQUEST} timeframes allowed per request.`);
      return;
    }

    setSelectedTimeframes(withoutAuto);
  };

  // Handle Padding Changes (mirroring if sameOnBothSides)
  const handlePaddingBeforeChange = (val: number) => {
    const clamped = Math.max(0, Math.min(MAX_CHART_PADDING_CANDLES, Math.floor(val || 0)));
    setPaddingBefore(clamped);
    if (sameOnBothSides) {
      setPaddingAfter(clamped);
    }
  };

  const handlePaddingAfterChange = (val: number) => {
    const clamped = Math.max(0, Math.min(MAX_CHART_PADDING_CANDLES, Math.floor(val || 0)));
    setPaddingAfter(clamped);
    if (sameOnBothSides) {
      setPaddingBefore(clamped);
    }
  };

  // Generate Mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const isAuto = selectedTimeframes.includes('Auto');
      const resolutions = isAuto
        ? undefined
        : selectedTimeframes.map((tf) => LABEL_TO_RESOLUTION[tf]).filter(Boolean);

      return api.trades.generateChart(tradeId, {
        force: replaceExisting,
        resolutions,
        paddingBefore,
        paddingAfter,
      });
    },
    onSuccess: (res: any) => {
      const results: IChartGenerateResult[] = res?.results || res?.data?.results || [];
      if (results.length > 0) {
        setLastResults(results);
        const createdCount = results.filter((r) => r.status === 'CREATED').length;
        const replacedCount = results.filter((r) => r.status === 'REPLACED').length;
        const skippedCount = results.filter((r) => r.status === 'SKIPPED_EXISTS').length;
        const failedCount = results.filter((r) => r.status === 'FAILED').length;

        const parts: string[] = [];
        if (createdCount > 0) parts.push(`${createdCount} created`);
        if (replacedCount > 0) parts.push(`${replacedCount} replaced`);
        if (skippedCount > 0) parts.push(`${skippedCount} skipped (already exists)`);
        if (failedCount > 0) parts.push(`${failedCount} failed`);

        if (failedCount > 0 && createdCount === 0 && replacedCount === 0) {
          toast.error(`Chart generation failed: ${parts.join(', ')}`);
        } else {
          toast.success(`Execution charts: ${parts.join(', ')}.`);
        }
      } else if (res?.data?.id || res?.data?._id) {
        // Legacy single-chart response
        toast.success('Automated execution chart generated successfully.');
        setLastResults([
          {
            resolution: '5',
            timeframe: '5m',
            status: 'CREATED',
            requestedBefore: paddingBefore,
            requestedAfter: paddingAfter,
            appliedBefore: paddingBefore,
            appliedAfter: paddingAfter,
            truncated: false,
            warnings: [],
          },
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ['trade', tradeId] });
      queryClient.invalidateQueries({ queryKey: ['attachments', tradeId] });
      if (onGenerated) onGenerated();
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to generate execution charts');
    },
  });

  // Duration Helper for Live Hint
  const formatTimeSpan = (tf: string, candles: number): string => {
    if (candles === 0) return '0m';
    if (tf === '1D') {
      return `${candles} trading day${candles === 1 ? '' : 's'}`;
    }
    const minsPerCandle = tf === '1m' ? 1 : tf === '5m' ? 5 : tf === '15m' ? 15 : tf === '30m' ? 30 : tf === '1h' ? 60 : 5;
    const totalMins = candles * minsPerCandle;
    if (totalMins < 60) return `${totalMins}m`;
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  // Provider Lookback warnings calculation
  const getLookbackWarning = (tf: string): string | null => {
    if (!entryDate) return null;
    const entryTime = new Date(entryDate).getTime();
    const now = Date.now();
    const daysAgo = (now - entryTime) / (1000 * 60 * 60 * 24);

    if (tf === '1m' && daysAgo > 30) {
      return 'Entry exceeds Angel One 30-day limit for 1m candles';
    }
    if (['5m', '15m', '30m', '1h'].includes(tf) && daysAgo > 90) {
      return 'Entry exceeds Angel One 90-day limit for intraday candles';
    }
    if (tf === '1D' && daysAgo > 365) {
      return 'Entry exceeds Angel One 365-day limit for daily candles';
    }
    return null;
  };

  const isPanelDisabled = !isClosedTrade || !isMarketDataConnected;
  const isGenerateDisabled =
    isPanelDisabled ||
    generateMutation.isPending ||
    selectedTimeframes.length === 0 ||
    wouldExceedLimit;

  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        mb: 3,
        borderRadius: 3,
        border: `1px solid ${muiTheme.palette.divider}`,
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          pb: 2,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 2,
              backgroundColor: 'rgba(6, 182, 212, 0.12)',
              color: '#06b6d4',
            }}
          >
            <ElectricBoltRounded fontSize="small" />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em' }}>
                Generate Execution Charts
              </Typography>
              <Chip
                label={`${totalAttachmentsCount}/12 Screenshots`}
                size="small"
                color={totalAttachmentsCount >= 12 ? 'error' : totalAttachmentsCount >= 10 ? 'warning' : 'default'}
                sx={{
                  fontWeight: 700,
                  fontSize: '0.6875rem',
                  fontFamily: `'JetBrains Mono', monospace`,
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
              Automated multi-timeframe charts with entry/exit execution markers and customizable candle padding
            </Typography>
          </Box>
        </Box>

        {/* Provider connectivity chips */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isStatusChecking ? (
            <Chip
              icon={<CircularProgress size={12} sx={{ color: 'inherit' }} />}
              label="Checking Providers..."
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.6875rem',
              }}
            />
          ) : isMarketDataConnected ? (
            <>
              {isFyersConnected && (
                <Chip
                  icon={<CheckCircleRounded sx={{ fontSize: 13, color: '#10b981 !important' }} />}
                  label="FYERS Active"
                  size="small"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.6875rem',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                  }}
                />
              )}
              {isAngelOneConnected && (
                <Chip
                  icon={<CheckCircleRounded sx={{ fontSize: 13, color: '#f59e0b !important' }} />}
                  label="Angel One Active"
                  size="small"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.6875rem',
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                  }}
                />
              )}
            </>
          ) : (
            <Chip
              icon={<WarningAmberRounded sx={{ fontSize: 13, color: '#ef4444 !important' }} />}
              label="No Market Data Provider"
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: '0.6875rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            />
          )}

          <Button
            variant="outlined"
            size="small"
            startIcon={<ShowChartRounded sx={{ color: '#06b6d4' }} />}
            onClick={() => setInteractiveModalOpen(true)}
            sx={{
              fontWeight: 700,
              fontSize: '0.75rem',
              borderRadius: 2,
              textTransform: 'none',
              borderColor: 'rgba(6, 182, 212, 0.4)',
              color: '#06b6d4',
              '&:hover': {
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.08)',
              },
            }}
          >
            Interactive Real Chart
          </Button>
        </Box>
      </Box>

      {/* Disabling Helper Alerts */}
      {!isClosedTrade && (
        <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }} role="alert">
          Execution charts can only be generated for <strong>CLOSED</strong> trades with completed exits.
        </Alert>
      )}

      {isClosedTrade && !isStatusChecking && !isMarketDataConnected && (
        <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }} role="alert">
          No market data provider is connected. Connect <strong>FYERS</strong> or <strong>Angel One</strong> in Settings to generate execution charts.
        </Alert>
      )}

      {wouldExceedLimit && !isPanelDisabled && (
        <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }} role="alert">
          Request would exceed the 12-attachment limit ({totalAttachmentsCount} current + {netNewSlotsNeeded} new &gt; 12).
          Enable "Replace existing charts" or delete older screenshots to proceed.
        </Alert>
      )}

      {/* Controls Grid */}
      <Box sx={{ mt: 2.5, opacity: isPanelDisabled ? 0.6 : 1, pointerEvents: isPanelDisabled ? 'none' : 'auto' }}>
        <Grid container spacing={2.5} sx={{ alignItems: 'flex-start' }}>
          {/* Timeframe Multi-Select */}
          <Grid size={{ xs: 12, md: 5 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="chart-timeframes-label">Timeframes (Max 5)</InputLabel>
              <Select
                labelId="chart-timeframes-label"
                id="chart-timeframes-select"
                multiple
                value={selectedTimeframes}
                onChange={(e) => handleTimeframeChange(e.target.value as string[])}
                input={<OutlinedInput label="Timeframes (Max 5)" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {(selected as TimeframeOption[]).map((val) => (
                      <Chip
                        key={val}
                        label={val}
                        size="small"
                        color={val === 'Auto' ? 'secondary' : 'primary'}
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.6875rem',
                          height: 22,
                        }}
                      />
                    ))}
                  </Box>
                )}
                aria-label="Select execution chart timeframes"
              >
                {TIMEFRAME_OPTIONS.map((tf) => {
                  const isSelected = selectedTimeframes.includes(tf);
                  const isAutoSelected = selectedTimeframes.includes('Auto');
                  const isMaxReached =
                    !isSelected &&
                    !isAutoSelected &&
                    tf !== 'Auto' &&
                    selectedTimeframes.length >= MAX_CHART_TIMEFRAMES_PER_REQUEST;

                  return (
                    <MenuItem
                      key={tf}
                      value={tf}
                      disabled={isMaxReached}
                      sx={{
                        fontSize: '0.8125rem',
                        fontWeight: isSelected ? 700 : 500,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{tf === 'Auto' ? 'Auto (Duration-based: 1m ≤ 4h, else 5m)' : tf}</span>
                      {isSelected && (
                        <CheckCircleRounded sx={{ fontSize: 16, color: muiTheme.palette.primary.main, ml: 1 }} />
                      )}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>

            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block', mt: 0.5 }}>
              Picks base candles and renders execution markers with selected resolutions
            </Typography>
          </Grid>

          {/* Candle Padding Controls */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <TuneRounded sx={{ fontSize: 16, color: muiTheme.palette.text.secondary }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: muiTheme.palette.text.secondary }}>
                    Candles Around Trade (0 – {MAX_CHART_PADDING_CANDLES})
                  </Typography>
                  <HelpHint hintKey="trade.chartGen.padding" />
                </Box>

                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={sameOnBothSides}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSameOnBothSides(checked);
                        if (checked) setPaddingAfter(paddingBefore);
                      }}
                      slotProps={{ input: { 'aria-label': 'Mirror padding on both sides' } }}
                    />
                  }
                  label={
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                      Same on both sides
                    </Typography>
                  }
                  sx={{ m: 0 }}
                />
              </Box>

              <Grid container spacing={1.5}>
                {/* Padding Before Entry */}
                <Grid size={{ xs: 6 }}>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={CHART_PADDING_PRESETS.map(String)}
                    value={String(paddingBefore)}
                    onChange={(_e, val) => {
                      if (val !== null) handlePaddingBeforeChange(parseInt(val, 10));
                    }}
                    onInputChange={(_e, val) => {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) handlePaddingBeforeChange(num);
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Before Entry"
                        placeholder="45"
                        helperText="Candles shown before entry"
                        type="number"
                        slotProps={{
                          htmlInput: {
                            ...params.slotProps?.htmlInput,
                            min: 0,
                            max: MAX_CHART_PADDING_CANDLES,
                            'aria-label': 'Candles before entry',
                          },
                        }}
                      />
                    )}
                  />
                </Grid>

                {/* Padding After Exit */}
                <Grid size={{ xs: 6 }}>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={CHART_PADDING_PRESETS.map(String)}
                    value={String(paddingAfter)}
                    disabled={sameOnBothSides}
                    onChange={(_e, val) => {
                      if (val !== null) handlePaddingAfterChange(parseInt(val, 10));
                    }}
                    onInputChange={(_e, val) => {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) handlePaddingAfterChange(num);
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="After Exit"
                        placeholder="45"
                        helperText="Candles shown after exit"
                        type="number"
                        slotProps={{
                          htmlInput: {
                            ...params.slotProps?.htmlInput,
                            min: 0,
                            max: MAX_CHART_PADDING_CANDLES,
                            'aria-label': 'Candles after exit',
                          },
                        }}
                      />
                    )}
                  />
                </Grid>
              </Grid>
            </Box>
          </Grid>
        </Grid>

        {/* Live Hints & Lookback warnings per selected timeframe */}
        {selectedTimeframes.length > 0 && (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 2,
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.03)',
              border: `1px dashed ${muiTheme.palette.divider}`,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.75 }}>
              Window Estimate & Provider Constraints:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {selectedTimeframes.map((tf) => {
                const lookbackWarn = tf !== 'Auto' ? getLookbackWarning(tf) : null;
                const preSpan = formatTimeSpan(tf === 'Auto' ? '5m' : tf, paddingBefore);
                const postSpan = formatTimeSpan(tf === 'Auto' ? '5m' : tf, paddingAfter);

                return (
                  <Box
                    key={tf}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 1,
                      fontSize: '0.75rem',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Chip
                        label={tf}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                        }}
                      />
                      <Typography variant="caption" sx={{ color: muiTheme.palette.text.primary }}>
                        {tf === 'Auto' ? (
                          <span>
                            Auto resolution: <strong>{paddingBefore}</strong> pre ({preSpan}) / <strong>{paddingAfter}</strong> post ({postSpan})
                          </span>
                        ) : (
                          <span>
                            {tf} &times; {paddingBefore} = ~{preSpan} pre-entry &bull; &times; {paddingAfter} = ~{postSpan} post-exit
                          </span>
                        )}
                      </Typography>
                    </Box>

                    {lookbackWarn && (
                      <Chip
                        icon={<WarningAmberRounded sx={{ fontSize: 12, color: '#f59e0b !important' }} />}
                        label={lookbackWarn}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          backgroundColor: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                        }}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Action Row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
            mt: 2.5,
            pt: 2,
            borderTop: `1px solid ${muiTheme.palette.divider}`,
          }}
        >
          <FormControlLabel
            control={
              <Checkbox
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                size="small"
                slotProps={{ input: { 'aria-label': 'Replace existing execution charts' } }}
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                  Replace existing charts
                </Typography>
                <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, display: 'block' }}>
                  Overwrites charts with matching timeframe and deletes their previous storage objects
                </Typography>
              </Box>
            }
          />

          <Button
            variant="contained"
            color="primary"
            disabled={isGenerateDisabled}
            onClick={() => generateMutation.mutate()}
            startIcon={
              generateMutation.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <ElectricBoltRounded />
              )
            }
            sx={{
              fontWeight: 700,
              fontSize: '0.8125rem',
              borderRadius: 2,
              px: 3,
              py: 1,
              textTransform: 'none',
              backgroundColor: '#06b6d4',
              color: '#fff',
              '&:hover': {
                backgroundColor: '#0891b2',
              },
              boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)',
            }}
            aria-label="Generate execution charts"
          >
            {generateMutation.isPending ? 'Generating Charts...' : 'Generate Execution Charts'}
          </Button>
        </Box>
      </Box>

      {/* Inline Results List (Post-Generation Summary) */}
      {lastResults && lastResults.length > 0 && (
        <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${muiTheme.palette.divider}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.875rem' }}>
              Execution Chart Results
            </Typography>
            <Button
              size="small"
              onClick={() => setLastResults(null)}
              sx={{ fontSize: '0.6875rem', textTransform: 'none' }}
            >
              Dismiss
            </Button>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {lastResults.map((res, idx) => {
              const statusColor =
                res.status === 'CREATED'
                  ? '#10b981'
                  : res.status === 'REPLACED'
                  ? '#06b6d4'
                  : res.status === 'SKIPPED_EXISTS'
                  ? '#f59e0b'
                  : '#ef4444';

              const statusBg =
                res.status === 'CREATED'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : res.status === 'REPLACED'
                  ? 'rgba(6, 182, 212, 0.12)'
                  : res.status === 'SKIPPED_EXISTS'
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)';

              const statusLabel =
                res.status === 'CREATED'
                  ? 'Created'
                  : res.status === 'REPLACED'
                  ? 'Replaced'
                  : res.status === 'SKIPPED_EXISTS'
                  ? 'Skipped (Exists)'
                  : `Failed: ${res.errorCode || 'ERROR'}`;

              return (
                <Paper
                  key={`${res.resolution}-${idx}`}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1.5,
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.6)',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Chip
                      label={res.timeframe || res.resolution}
                      size="small"
                      sx={{
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        fontFamily: `'JetBrains Mono', monospace`,
                      }}
                    />
                    <Chip
                      label={statusLabel}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.6875rem',
                        backgroundColor: statusBg,
                        color: statusColor,
                        border: `1px solid ${statusColor}44`,
                      }}
                    />
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                      Padding: <strong>{res.appliedBefore ?? res.requestedBefore}</strong> pre /{' '}
                      <strong>{res.appliedAfter ?? res.requestedAfter}</strong> post
                      {res.appliedBefore !== undefined &&
                        res.requestedBefore !== undefined &&
                        (res.appliedBefore < res.requestedBefore || res.appliedAfter! < res.requestedAfter!) && (
                          <span style={{ color: '#f59e0b', marginLeft: 4 }}>(reduced from requested)</span>
                        )}
                      {res.truncated && (
                        <span style={{ color: '#f59e0b', marginLeft: 4 }}>(window truncated to 1,500 candles)</span>
                      )}
                    </Typography>
                  </Box>

                  {res.warnings && res.warnings.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {res.warnings.map((w, wIdx) => (
                        <Chip
                          key={wIdx}
                          label={w}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.625rem',
                            fontWeight: 600,
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            color: '#f59e0b',
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Box>
        </Box>
      )}
      {/* Interactive Real TradingView Chart Modal */}
      <InteractiveTradingViewModal
        open={interactiveModalOpen}
        onClose={() => setInteractiveModalOpen(false)}
        tradeId={tradeId}
        symbol={symbol}
      />
    </Card>
  );
}
