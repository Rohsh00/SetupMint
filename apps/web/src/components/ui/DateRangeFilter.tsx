import React, { useState, useEffect, useId } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';

import {
  DateRangePreset,
  DATE_RANGE_PRESETS,
  isValidCalendarDate,
  resolvePreset,
} from '@tradevault/shared';
import { useDateRange, PRESET_LABELS } from '../../context/DateRangeContext.js';
import { formatDate } from '../../lib/utils.js';

export interface DateRangeFilterProps {
  /** Optional override if used locally outside global context */
  preset?: DateRangePreset;
  startDate?: string;
  endDate?: string;
  onPresetChange?: (preset: DateRangePreset) => void;
  onCustomChange?: (start?: string, end?: string) => void;
  onReset?: () => void;
  /** Custom label prefix or placement */
  label?: string;
  /** Full width on desktop as well */
  fullWidth?: boolean;
  size?: 'small' | 'medium';
}

const PRESET_GROUPS: { groupLabel: string; presets: DateRangePreset[] }[] = [
  {
    groupLabel: 'Days',
    presets: ['TODAY', 'YESTERDAY', '7D', '30D', '90D'],
  },
  {
    groupLabel: 'Periods',
    presets: ['THIS_WEEK', 'LAST_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER'],
  },
  {
    groupLabel: 'Fiscal & Macro',
    presets: ['YTD', 'THIS_FY', 'LAST_FY', 'ALL_TIME'],
  },
];

export function DateRangeFilter({
  preset: propPreset,
  startDate: propStartDate,
  endDate: propEndDate,
  onPresetChange,
  onCustomChange,
  onReset,
  label,
  fullWidth = false,
  size = 'small',
}: DateRangeFilterProps) {
  // Use global context if props are omitted
  const globalContext = useDateRange();
  const preset = propPreset ?? globalContext.preset;
  const startDate = propStartDate ?? globalContext.startDate;
  const endDate = propEndDate ?? globalContext.endDate;

  const handleSelectPreset = (p: DateRangePreset) => {
    if (onPresetChange) {
      onPresetChange(p);
    } else {
      globalContext.setPreset(p);
    }
    handleClose();
  };

  const handleApplyCustom = (s?: string, e?: string) => {
    if (onCustomChange) {
      onCustomChange(s, e);
    } else {
      globalContext.setCustomRange(s, e);
    }
    handleClose();
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      globalContext.resetRange();
    }
    setCustomStart('');
    setCustomEnd('');
    handleClose();
  };

  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const popoverId = useId();

  // Popover state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isOpen = Boolean(anchorEl);

  // Custom inputs state inside popover
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize draft custom dates when popover opens
  useEffect(() => {
    if (isOpen) {
      setCustomStart(startDate || '');
      setCustomEnd(endDate || '');
      setValidationError(null);
    }
  }, [isOpen, startDate, endDate]);

  // Validate custom date range input
  useEffect(() => {
    if (!customStart && !customEnd) {
      setValidationError(null);
      return;
    }

    if (customStart && !isValidCalendarDate(customStart)) {
      setValidationError('Invalid start date format (YYYY-MM-DD required)');
      return;
    }
    if (customEnd && !isValidCalendarDate(customEnd)) {
      setValidationError('Invalid end date format (YYYY-MM-DD required)');
      return;
    }

    if (customStart && customEnd && customStart > customEnd) {
      setValidationError('Start date cannot be after end date');
      return;
    }

    setValidationError(null);
  }, [customStart, customEnd]);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // Build trigger button display text
  const isFiltered = preset !== 'ALL_TIME' || Boolean(startDate) || Boolean(endDate);
  let displayText = 'All Time';
  if (preset === 'ALL_TIME') {
    displayText = 'All Time';
  } else if (preset === 'CUSTOM') {
    if (startDate && endDate) {
      displayText = startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(endDate)}`;
    } else if (startDate) {
      displayText = `From ${formatDate(startDate)}`;
    } else if (endDate) {
      displayText = `Until ${formatDate(endDate)}`;
    } else {
      displayText = 'Custom Range';
    }
  } else {
    // Known preset: show preset label and date bounds
    const label = PRESET_LABELS[preset] || preset;
    if (startDate && endDate) {
      displayText = `${label} (${formatDate(startDate)} – ${formatDate(endDate)})`;
    } else {
      displayText = label;
    }
  }

  const isCustomValid = !validationError && (Boolean(customStart) || Boolean(customEnd));

  return (
    <Box
      sx={{
        width: fullWidth ? '100%' : { xs: '100%', sm: 'auto' },
        display: 'inline-block',
      }}
    >
      {/* Trigger Button */}
      <Button
        id="date-range-filter-trigger"
        aria-describedby={isOpen ? popoverId : undefined}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={handleOpen}
        variant={isFiltered ? 'contained' : 'outlined'}
        color={isFiltered ? 'primary' : 'inherit'}
        size={size}
        startIcon={<CalendarMonthRoundedIcon fontSize="small" />}
        endIcon={<ExpandMoreRoundedIcon fontSize="small" sx={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />}
        sx={{
          width: fullWidth ? '100%' : { xs: '100%', sm: 'auto' },
          justifyContent: 'space-between',
          fontWeight: 600,
          fontSize: '0.8125rem',
          borderRadius: 2,
          textTransform: 'none',
          py: 0.75,
          px: 1.5,
          borderColor: isFiltered ? 'transparent' : muiTheme.palette.divider,
          backgroundColor: isFiltered
            ? `${muiTheme.palette.primary.main} !important`
            : isDark
            ? 'rgba(255, 255, 255, 0.04)'
            : 'rgba(0, 0, 0, 0.02)',
          color: isFiltered ? '#FFFFFF !important' : muiTheme.palette.text.primary,
          boxShadow: isFiltered ? '0 2px 8px rgba(16, 185, 129, 0.25)' : 'none',
          '&:hover': {
            backgroundColor: isFiltered
              ? `${muiTheme.palette.primary.dark} !important`
              : isDark
              ? 'rgba(255, 255, 255, 0.08)'
              : 'rgba(0, 0, 0, 0.06)',
            borderColor: isFiltered ? 'transparent' : muiTheme.palette.primary.main,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label && <Typography component="span" variant="caption" sx={{ color: isFiltered ? 'rgba(255,255,255,0.8)' : muiTheme.palette.text.secondary, fontWeight: 700 }}>{label}:</Typography>}
          <Typography component="span" variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayText}
          </Typography>
        </Box>
      </Button>

      {/* Popover Selection Dialog */}
      <Popover
        id={popoverId}
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
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
              mt: 1,
              width: { xs: 'calc(100vw - 32px)', sm: 460 },
              maxWidth: 520,
              p: 2.5,
              borderRadius: 3,
              backgroundColor: muiTheme.palette.background.paper,
              border: `1px solid ${muiTheme.palette.divider}`,
              boxShadow: isDark ? '0 16px 36px rgba(0, 0, 0, 0.65)' : '0 16px 36px rgba(15, 23, 42, 0.15)',
            },
          },
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarMonthRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Select Date Range
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleClose} aria-label="Close date filter picker">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Preset Chips categorized */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
          {PRESET_GROUPS.map((group) => (
            <Box key={group.groupLabel}>
              <Typography
                variant="caption"
                sx={{
                  color: muiTheme.palette.text.secondary,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontSize: '0.6875rem',
                  display: 'block',
                  mb: 0.75,
                }}
              >
                {group.groupLabel}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {group.presets.map((p) => {
                  const isSelected = preset === p;
                  return (
                    <Chip
                      key={p}
                      label={PRESET_LABELS[p]}
                      onClick={() => handleSelectPreset(p)}
                      color={isSelected ? 'primary' : 'default'}
                      variant={isSelected ? 'filled' : 'outlined'}
                      size="small"
                      icon={isSelected ? <CheckRoundedIcon fontSize="inherit" /> : undefined}
                      sx={{
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        borderRadius: 1.5,
                        '&:hover': {
                          borderColor: muiTheme.palette.primary.main,
                        },
                      }}
                    />
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Custom Range Picker */}
        <Box>
          <Typography
            variant="caption"
            sx={{
              color: muiTheme.palette.text.secondary,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.6875rem',
              display: 'block',
              mb: 1.25,
            }}
          >
            Custom Date Range (IST Session Dates)
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
            <TextField
              id="date-filter-start-input"
              label="Start Date"
              type="date"
              size="small"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: new Date().toISOString().slice(0, 10) },
              }}
              fullWidth
            />
            <TextField
              id="date-filter-end-input"
              label="End Date"
              type="date"
              size="small"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: new Date().toISOString().slice(0, 10) },
              }}
              fullWidth
            />
          </Box>

          {validationError && (
            <Alert severity="error" sx={{ py: 0.25, px: 1.5, mb: 1.5, fontSize: '0.75rem' }}>
              {validationError}
            </Alert>
          )}

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, pt: 1 }}>
            <Button
              id="date-filter-reset-btn"
              variant="text"
              color="inherit"
              size="small"
              onClick={handleReset}
              startIcon={<RestartAltRoundedIcon fontSize="small" />}
              sx={{ fontWeight: 600, fontSize: '0.75rem', color: muiTheme.palette.text.secondary }}
            >
              Reset to All Time
            </Button>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                onClick={handleClose}
                sx={{ fontWeight: 600, fontSize: '0.75rem' }}
              >
                Cancel
              </Button>
              <Button
                id="date-filter-apply-btn"
                variant="contained"
                color="primary"
                size="small"
                disabled={!isCustomValid}
                onClick={() => handleApplyCustom(customStart || undefined, customEnd || undefined)}
                sx={{ fontWeight: 700, fontSize: '0.75rem' }}
              >
                Apply Range
              </Button>
            </Box>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}
export default DateRangeFilter;
