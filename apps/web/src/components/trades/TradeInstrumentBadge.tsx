import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Tooltip,
  IconButton,
  Popover,
  Button,
  Divider,
  useTheme,
  SxProps,
  Theme,
} from '@mui/material';
import {
  CollectionsRounded as CollectionsIcon,
  TuneRounded as TuneIcon,
  SearchRounded as SearchIcon,
  CalculateRounded as CalculateIcon,
  InfoOutlined as InfoIcon,
  TrendingUpRounded as TrendingUpIcon,
} from '@mui/icons-material';

export interface TradeInstrumentData {
  id?: string;
  symbol: string;
  underlying?: string;
  optionType?: 'CALL' | 'PUT' | 'CE' | 'PE' | string;
  strikePrice?: number;
  expiryDate?: string | Date | null;
  instrumentName?: string;
  assetClass?: string;
  exchange?: string;
  marketSegment?: string;
  simpleExecution?: {
    contractMultiplier?: number;
    [k: string]: any;
  };
  screenshotIds?: string[];
  [k: string]: any;
}

export interface TradeInstrumentBadgeProps {
  trade: TradeInstrumentData;
  linkToTrade?: boolean;
  size?: 'small' | 'medium' | 'large';
  showMultiplierBadge?: boolean;
  showSubtitle?: boolean;
  showScreenshotsCount?: boolean;
  showQuickActions?: boolean;
  onFilterUnderlying?: (underlying: string) => void;
  sx?: SxProps<Theme>;
}

/**
 * Extracts and normalizes contract parameters (Option strike/type, Futures, Expiry, Underlying)
 */
function parseContractDetails(trade: TradeInstrumentData) {
  const rawSymbol = String(trade.symbol || '').trim();
  let underlying = trade.underlying?.trim().toUpperCase();

  if (!underlying) {
    // Strip exchange prefixes
    let clean = rawSymbol.replace(/^(NSE|BSE|MCX|BINANCE|FOREX):/i, '').trim();
    clean = clean.replace(/-EQ|-BE$/i, '').trim();

    // Match common root underlyings
    const rootMatch = clean.match(
      /^(BANKNIFTY|FINNIFTY|MIDCPNIFTY|NIFTY|SENSEX|BANKEX|CRUDEOILM|CRUDEOILMINI|CRUDEOIL|NATGASMINI|NATURALGAS|NATGAS|GOLDM|GOLD|SILVERM|SILVER|COPPER)/i
    );
    if (rootMatch) {
      underlying = rootMatch[1].toUpperCase();
      if (underlying === 'CRUDEOILMINI') underlying = 'CRUDEOILM';
      if (underlying === 'NATGAS') underlying = 'NATURALGAS';
    } else {
      // Fallback regex for equity options: RELIANCE24OCT3000CE
      const eqOptMatch = clean.match(/^([A-Z0-9&-]+?)\s*(?:\d{2}[A-Z]{3}|\d{2}[1-9OND]\d{2}|\d{4,})/i);
      underlying = eqOptMatch ? eqOptMatch[1].toUpperCase() : clean;
    }
  }

  // Parse Option Strike & Type
  let strike = trade.strikePrice ? String(trade.strikePrice) : '';
  let optType: 'CE' | 'PE' | null = null;

  if (trade.optionType) {
    optType =
      trade.optionType === 'CALL' || trade.optionType === 'CE'
        ? 'CE'
        : trade.optionType === 'PUT' || trade.optionType === 'PE'
        ? 'PE'
        : null;
  }

  // If not in fields, attempt extraction from raw symbol
  if (!optType) {
    if (/(?:CALL|CE)$/i.test(rawSymbol)) optType = 'CE';
    else if (/(?:PUT|PE)$/i.test(rawSymbol)) optType = 'PE';
  }
  if (!strike && optType) {
    const sMatch = rawSymbol.match(/(\d+(?:\.\d+)?)\s*(?:CE|PE|CALL|PUT)$/i);
    if (sMatch) strike = sMatch[1];
  }

  // Check Futures
  const isFutures =
    trade.assetClass === 'FUTURES' ||
    (!optType && (/FUT$/i.test(rawSymbol) || /FUTURES$/i.test(rawSymbol)));

  // Format Expiry
  let expiryStr = '';
  if (trade.expiryDate) {
    try {
      const d = new Date(trade.expiryDate);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        expiryStr = `${day}-${monthNames[d.getMonth()]}`;
      }
    } catch {
      // Ignore date parse errors
    }
  } else {
    // Attempt parse from symbol e.g. 24OCT
    const expMatch = rawSymbol.match(/\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i);
    if (expMatch) expiryStr = expMatch[0].toUpperCase();
  }

  const multiplier = trade.simpleExecution?.contractMultiplier ?? 1;

  return {
    underlying: underlying || rawSymbol,
    strike,
    optType,
    isFutures,
    expiryStr,
    multiplier,
  };
}

export function TradeInstrumentBadge({
  trade,
  linkToTrade = true,
  size = 'small',
  showMultiplierBadge = true,
  showSubtitle = true,
  showScreenshotsCount = true,
  showQuickActions = true,
  onFilterUnderlying,
  sx,
}: TradeInstrumentBadgeProps) {
  const muiTheme = useTheme();
  const navigate = useNavigate();
  const isDark = muiTheme.palette.mode === 'dark';

  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);

  const { underlying, strike, optType, isFutures, expiryStr, multiplier } = parseContractDetails(trade);

  const isLarge = size === 'large';
  const isMedium = size === 'medium';

  const fontSizes = {
    symbol: isLarge ? '1.375rem' : isMedium ? '0.9375rem' : '0.8125rem',
    strike: isLarge ? '0.8125rem' : '0.6875rem',
    badge: isLarge ? '0.75rem' : '0.625rem',
    subtitle: isLarge ? '0.8125rem' : '0.6875rem',
  };

  const handleOpenPopover = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setPopoverAnchor(e.currentTarget);
  };

  const handleClosePopover = () => {
    setPopoverAnchor(null);
  };

  const handleFilterLedger = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClosePopover();
    if (onFilterUnderlying) {
      onFilterUnderlying(underlying);
    } else {
      navigate(`/trades?search=${encodeURIComponent(underlying)}`);
    }
  };

  const handleOpenRiskCalculator = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClosePopover();
    navigate(`/risk-calculator?symbol=${encodeURIComponent(underlying)}`);
  };

  const handleOpenInstrumentsSpecs = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClosePopover();
    navigate(`/instruments?search=${encodeURIComponent(underlying)}`);
  };

  const symbolContent = (
    <Box
      component="span"
      sx={{
        fontWeight: isLarge ? 800 : 700,
        fontFamily: `'JetBrains Mono', monospace`,
        color: muiTheme.palette.text.primary,
        letterSpacing: '-0.01em',
        transition: 'color 0.15s ease',
        '&:hover': linkToTrade
          ? {
              color: muiTheme.palette.primary.main,
              textDecoration: 'underline',
            }
          : undefined,
      }}
    >
      {underlying}
    </Box>
  );

  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', gap: 0.35, ...sx }}>
      {/* Top Line: Underlying Symbol + Option/Futures Tags + Multiplier + Screenshots */}
      <Box sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
        {/* Symbol Link or Static Display */}
        {linkToTrade && trade.id ? (
          <RouterLink
            to={`/trades/${trade.id}`}
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            {symbolContent}
          </RouterLink>
        ) : (
          symbolContent
        )}

        {/* Option Strike + CE/PE Badge */}
        {optType && (
          <Tooltip title={`Option Contract: ${strike ? strike + ' ' : ''}${optType === 'CE' ? 'Call (CE)' : 'Put (PE)'}`} arrow>
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 0.7,
                py: 0.15,
                borderRadius: 1,
                fontSize: fontSizes.strike,
                fontWeight: 700,
                fontFamily: `'JetBrains Mono', monospace`,
                lineHeight: 1.2,
                backgroundColor:
                  optType === 'CE'
                    ? isDark
                      ? 'rgba(59, 130, 246, 0.16)'
                      : 'rgba(59, 130, 246, 0.1)'
                    : isDark
                    ? 'rgba(168, 85, 247, 0.18)'
                    : 'rgba(147, 51, 234, 0.1)',
                color:
                  optType === 'CE'
                    ? isDark
                      ? '#60a5fa'
                      : '#2563eb'
                    : isDark
                    ? '#c084fc'
                    : '#7e22ce',
                border: `1px solid ${
                  optType === 'CE'
                    ? isDark
                      ? 'rgba(59, 130, 246, 0.3)'
                      : 'rgba(59, 130, 246, 0.25)'
                    : isDark
                    ? 'rgba(168, 85, 247, 0.35)'
                    : 'rgba(147, 51, 234, 0.25)'
                }`,
              }}
            >
              {strike ? `${strike} ` : ''}{optType}
            </Box>
          </Tooltip>
        )}

        {/* Futures Badge */}
        {isFutures && (
          <Tooltip title="Futures Contract" arrow>
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 0.7,
                py: 0.15,
                borderRadius: 1,
                fontSize: fontSizes.strike,
                fontWeight: 700,
                fontFamily: `'JetBrains Mono', monospace`,
                lineHeight: 1.2,
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(217, 119, 6, 0.1)',
                color: isDark ? '#fbbf24' : '#b45309',
                border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(217, 119, 6, 0.25)'}`,
              }}
            >
              FUT
            </Box>
          </Tooltip>
        )}

        {/* Expiry Badge */}
        {expiryStr && (
          <Tooltip title={`Expiry Date: ${expiryStr}`} arrow>
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 0.6,
                py: 0.15,
                borderRadius: 1,
                fontSize: fontSizes.badge,
                fontWeight: 600,
                fontFamily: `'JetBrains Mono', monospace`,
                lineHeight: 1.2,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.04)',
                color: muiTheme.palette.text.secondary,
                border: `1px solid ${muiTheme.palette.divider}`,
              }}
            >
              {expiryStr}
            </Box>
          </Tooltip>
        )}

        {/* Contract Multiplier Badge (if > 1) */}
        {showMultiplierBadge && multiplier > 1 && (
          <Tooltip
            title={`Contract Multiplier: x${multiplier} • ₹${multiplier} net move per underlying point`}
            arrow
          >
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 0.6,
                py: 0.15,
                borderRadius: 1,
                fontSize: fontSizes.badge,
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                lineHeight: 1.2,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                color: isDark ? '#34d399' : '#059669',
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.25)'}`,
              }}
            >
              x{multiplier}
            </Box>
          </Tooltip>
        )}

        {/* Chart Screenshots Count Badge */}
        {showScreenshotsCount && trade.screenshotIds && trade.screenshotIds.length > 0 && (
          <Tooltip
            title={`${trade.screenshotIds.length} chart screenshot${trade.screenshotIds.length > 1 ? 's' : ''} attached`}
            arrow
          >
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                color: muiTheme.palette.primary.main,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                px: 0.6,
                py: 0.15,
                borderRadius: 1,
                fontSize: fontSizes.badge,
                fontWeight: 700,
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(5, 150, 105, 0.2)'}`,
              }}
            >
              <CollectionsIcon sx={{ fontSize: isLarge ? 14 : 11 }} />
              {trade.screenshotIds.length}
            </Box>
          </Tooltip>
        )}

        {/* Quick Actions Anchor Button */}
        {showQuickActions && (
          <Tooltip title={`Quick Actions for ${underlying}`} arrow>
            <IconButton
              size="small"
              onClick={handleOpenPopover}
              sx={{
                p: 0.25,
                width: 18,
                height: 18,
                color: 'text.secondary',
                opacity: 0.65,
                transition: 'opacity 0.15s, color 0.15s',
                '&:hover': {
                  opacity: 1,
                  color: 'primary.main',
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                },
              }}
            >
              <TuneIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Subtitle: Display Name / Instrument Description */}
      {showSubtitle && trade.instrumentName && trade.instrumentName !== trade.symbol && trade.instrumentName !== underlying && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontSize: fontSizes.subtitle,
            fontWeight: 500,
            lineHeight: 1.15,
          }}
        >
          {trade.instrumentName}
        </Typography>
      )}

      {/* Interactive Popover Menu for Instrument-level Actions */}
      <Popover
        open={Boolean(popoverAnchor)}
        anchorEl={popoverAnchor}
        onClose={handleClosePopover}
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
              p: 1.75,
              minWidth: 260,
              maxWidth: 320,
              borderRadius: 2,
              boxShadow: isDark
                ? '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
                : '0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
              border: `1px solid ${muiTheme.palette.divider}`,
              backgroundImage: 'none',
            },
          },
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {/* Header Info */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, fontFamily: `'JetBrains Mono', monospace` }}>
                {underlying}
              </Typography>
              <Chip
                label={trade.assetClass || 'EQUITY'}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.625rem', fontWeight: 700 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {trade.exchange ? `${trade.exchange} • ` : ''}
              {trade.marketSegment ? `${trade.marketSegment} • ` : ''}
              Multiplier: <strong>x{multiplier}</strong>
            </Typography>
          </Box>

          <Divider sx={{ my: 0.25 }} />

          {/* Action 1: Filter Ledger */}
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<SearchIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
            onClick={handleFilterLedger}
            sx={{
              justifyContent: 'flex-start',
              fontWeight: 600,
              fontSize: '0.78125rem',
              py: 0.75,
              px: 1,
              borderRadius: 1.5,
              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
            }}
          >
            Filter all {underlying} trades
          </Button>

          {/* Action 2: Plan in Risk Calculator */}
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<CalculateIcon sx={{ fontSize: 16, color: 'secondary.main' }} />}
            onClick={handleOpenRiskCalculator}
            sx={{
              justifyContent: 'flex-start',
              fontWeight: 600,
              fontSize: '0.78125rem',
              py: 0.75,
              px: 1,
              borderRadius: 1.5,
              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
            }}
          >
            Calculate position in Risk Calc
          </Button>

          {/* Action 3: View Contract Specifications */}
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<TuneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />}
            onClick={handleOpenInstrumentsSpecs}
            sx={{
              justifyContent: 'flex-start',
              fontWeight: 600,
              fontSize: '0.78125rem',
              py: 0.75,
              px: 1,
              borderRadius: 1.5,
              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
            }}
          >
            View specs in Instruments
          </Button>
        </Box>
      </Popover>
    </Box>
  );
}
