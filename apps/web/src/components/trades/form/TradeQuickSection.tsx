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
  IconButton,
  Tooltip,
  Divider,
  Collapse,
  Button,
  CircularProgress,
  useTheme,
} from '@mui/material';
import {
  TrendingUpRounded,
  TrendingDownRounded,
  AddRounded,
  RemoveRounded,
  TuneRounded,
  AttachMoneyRounded,
  SecurityRounded,
  SpeedRounded,
  ExpandMoreRounded,
  ExpandLessRounded,
  LocalOfferRounded,
  RotateLeftRounded,
  InfoOutlined,
  AccountTreeRounded,
} from '@mui/icons-material';
import {
  ASSET_CLASSES,
  MARKET_SEGMENTS,
  TRADING_SESSIONS,
  ITradeTemplate,
  TemplatePatch,
  ProvenanceSource,
  getPresetSpec,
} from '@tradevault/shared';
import { deriveSessionFromTime } from '@tradevault/financial-engine';
import { formatCurrency, toLocalIsoDateTime } from '../../../lib/utils.js';
import { MarketTemplateBar } from './MarketTemplateBar.js';

interface TradeQuickSectionProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
  accounts: any[];
  instruments: any[];
  strategies: any[];
  isAutoFees?: boolean;
  onToggleAutoFees?: (auto: boolean) => void;
  onResetAutoFees?: () => void;
  dirtyFields?: Record<string, any>;
  activeTemplate?: ITradeTemplate | null;
  provenanceMap?: Record<string, ProvenanceSource>;
  manualSlHint?: string | null;
  onApplyTemplatePatch?: (patch: TemplatePatch, template: ITradeTemplate) => void;
  onUndoTemplate?: () => void;
  hasAppliedTemplate?: boolean;
  appliedTemplateName?: string;
  missingStrategyName?: string | null;
  onCreateMissingStrategy?: (strategyName: string) => void | Promise<void>;
  isCreatingStrategy?: boolean;
  userTemplates?: ITradeTemplate[];
}

export function TradeQuickSection({
  register,
  watch,
  setValue,
  accounts,
  instruments,
  strategies,
  isAutoFees = true,
  onToggleAutoFees,
  onResetAutoFees,
  dirtyFields = {},
  activeTemplate = null,
  provenanceMap = {},
  manualSlHint = null,
  onApplyTemplatePatch,
  onUndoTemplate,
  hasAppliedTemplate = false,
  appliedTemplateName,
  missingStrategyName = null,
  onCreateMissingStrategy,
  isCreatingStrategy = false,
  userTemplates = [],
}: TradeQuickSectionProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const [showItemizedFees, setShowItemizedFees] = useState(false);

  const selectedSymbol = watch('symbol') || '';
  const direction = watch('direction') || 'LONG';
  const status = watch('status') || 'CLOSED';
  const quantity = watch('simpleExecution.quantity') || 1;
  const contractMultiplier = watch('simpleExecution.contractMultiplier') || 1;
  const entryPrice = watch('simpleExecution.entryPrice') || 0;
  const exitPrice = watch('simpleExecution.exitPrice') || 0;
  const stopLoss = watch('risk.initialStopLoss') || 0;
  const targetPrice = watch('risk.plannedTarget') || 0;

  // Active instrument metadata
  const currentInstrument = instruments.find(
    (i) => i.symbol.toUpperCase() === selectedSymbol.toUpperCase()
  );
  const lotSize = currentInstrument?.lotSize || 1;
  const lotsValue = lotSize > 0 ? Number(quantity) / lotSize : Number(quantity);

  const handleLotsChange = (valStr: string) => {
    if (valStr === '') return;
    const l = Number(valStr);
    if (!isNaN(l) && l >= 0) {
      const step = lotSize > 0 ? lotSize : 1;
      const computed = step >= 1 ? Math.max(step, Math.round(l * step)) : Math.max(step, Number((l * step).toFixed(6)));
      setValue('simpleExecution.quantity', computed);
    }
  };

  // Change symbol and auto-populate metadata
  const handleSelectSymbol = (sym: string) => {
    const symUpper = sym.toUpperCase();
    setValue('symbol', symUpper, { shouldDirty: true });

    const cleanSym = symUpper.replace(/^(MCX:|NSE:|BSE:)/i, '');
    const found = instruments.find(
      (i) => i.symbol.toUpperCase() === symUpper || i.symbol.toUpperCase() === cleanSym
    );
    if (found) {
      setValue('assetClass', found.assetClass, { shouldDirty: true });
      setValue('exchange', found.exchange, { shouldDirty: true });
      setValue('marketSegment', found.marketSegment, { shouldDirty: true });
      setValue('currency', found.quoteCurrency || 'INR', { shouldDirty: true });
      setValue('simpleExecution.contractMultiplier', found.contractMultiplier || 1, { shouldDirty: true });
      setValue('risk.lotSize', found.lotSize || 1, { shouldDirty: true });
      if (!watch('simpleExecution.quantity') || watch('simpleExecution.quantity') === 1) {
        setValue('simpleExecution.quantity', found.lotSize || 1, { shouldDirty: true });
      }
      const entryTime = watch('entryTime');
      if (entryTime) {
        setValue('session', deriveSessionFromTime(entryTime, found.exchange, found.marketSegment), { shouldDirty: true });
      }
    } else {
      const preset = getPresetSpec(cleanSym);
      if (preset) {
        setValue('assetClass', preset.assetClass, { shouldDirty: true });
        setValue('exchange', preset.exchange, { shouldDirty: true });
        setValue('marketSegment', preset.marketSegment, { shouldDirty: true });
        setValue('currency', preset.quoteCurrency || 'INR', { shouldDirty: true });
        setValue('simpleExecution.contractMultiplier', preset.contractMultiplier || 1, { shouldDirty: true });
        setValue('risk.lotSize', preset.lotSize || 1, { shouldDirty: true });
        if (!watch('simpleExecution.quantity') || watch('simpleExecution.quantity') === 1) {
          setValue('simpleExecution.quantity', preset.lotSize || 1, { shouldDirty: true });
        }
        const entryTime = watch('entryTime');
        if (entryTime) {
          setValue('session', deriveSessionFromTime(entryTime, preset.exchange, preset.marketSegment), { shouldDirty: true });
        }
      } else if (
        /PE$/i.test(cleanSym) ||
        /_PE$/i.test(cleanSym) ||
        /CE$/i.test(cleanSym) ||
        /_CE$/i.test(cleanSym)
      ) {
        setValue('assetClass', 'OPTIONS', { shouldDirty: true });
        setValue('optionType', /PE$/i.test(cleanSym) || /_PE$/i.test(cleanSym) ? 'PUT' : 'CALL', { shouldDirty: true });
      } else if (
        symUpper.startsWith('MCX:') ||
        /^(CRUDEOIL|NATGAS|NATURALGAS|GOLD|SILVER|COPPER|ZINC|NICKEL|ALUMINIUM|LEAD)/i.test(cleanSym)
      ) {
        setValue('assetClass', 'COMMODITY', { shouldDirty: true });
        setValue('exchange', 'MCX', { shouldDirty: true });
        setValue('marketSegment', 'MCX', { shouldDirty: true });
        setValue('currency', 'INR', { shouldDirty: true });
        const mult = cleanSym.startsWith('CRUDEOILM') ? 10 : cleanSym.startsWith('NATGASMINI') ? 250 : 1;
        setValue('simpleExecution.contractMultiplier', mult, { shouldDirty: true });
        const entryTime = watch('entryTime');
        if (entryTime) {
          setValue('session', deriveSessionFromTime(entryTime, 'MCX', 'MCX'), { shouldDirty: true });
        }
      }
    }
  };

  // Adjust quantity by lots
  const handleStepQuantity = (delta: number) => {
    const step = lotSize > 0 ? lotSize : 1;
    const current = Number(quantity) || step;
    const next = Math.max(step, current + delta * step);
    setValue('simpleExecution.quantity', next);
  };

  // Dynamic quick symbols prioritizing user's traded instruments
  const quickSymbols = instruments.length > 0
    ? Array.from(new Set(instruments.map((i: any) => i.symbol))).slice(0, 7)
    : ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'RELIANCE', 'CRUDEOIL', 'GOLD', 'BTCUSDT'];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Row 1: Account, Direction, Status, Symbol */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {/* Trading Account */}
        <TextField
          select
          size="small"
          label="Trading Account *"
          fullWidth
          value={watch('accountId') || ''}
          onChange={(e) => setValue('accountId', e.target.value)}
        >
          {accounts.map((acc) => (
            <MenuItem key={acc.id} value={acc.id}>
              {acc.name} ({acc.broker} • {acc.baseCurrency})
            </MenuItem>
          ))}
        </TextField>

        {/* Direction & Status Controls */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          {/* Direction Toggle */}
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={direction}
            onChange={(_, val) => val && setValue('direction', val)}
          >
            <ToggleButton
              value="LONG"
              sx={{
                fontWeight: 700,
                gap: 0.5,
                '&.Mui-selected': {
                  bgcolor: `${muiTheme.palette.profit.main}20 !important`,
                  color: `${muiTheme.palette.profit.main} !important`,
                  borderColor: `${muiTheme.palette.profit.main} !important`,
                },
              }}
            >
              <TrendingUpRounded sx={{ fontSize: 18 }} />
              LONG
            </ToggleButton>
            <ToggleButton
              value="SHORT"
              sx={{
                fontWeight: 700,
                gap: 0.5,
                '&.Mui-selected': {
                  bgcolor: `${muiTheme.palette.loss.main}20 !important`,
                  color: `${muiTheme.palette.loss.main} !important`,
                  borderColor: `${muiTheme.palette.loss.main} !important`,
                },
              }}
            >
              <TrendingDownRounded sx={{ fontSize: 18 }} />
              SHORT
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Trade Status Toggle */}
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={status}
            onChange={(_, val) => val && setValue('status', val)}
          >
            <ToggleButton
              value="CLOSED"
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                  color: 'text.primary',
                },
              }}
            >
              CLOSED
            </ToggleButton>
            <ToggleButton
              value="OPEN"
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                '&.Mui-selected': {
                  bgcolor: `${muiTheme.palette.info.main}20 !important`,
                  color: `${muiTheme.palette.info.main} !important`,
                  borderColor: `${muiTheme.palette.info.main} !important`,
                },
              }}
            >
              OPEN
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* Row 2: Symbol Input, Quick Chips & Contract Metadata */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 2 }}>
          <TextField
            label="Instrument Symbol *"
            size="small"
            fullWidth
            value={selectedSymbol}
            onChange={(e) => handleSelectSymbol(e.target.value)}
            placeholder="e.g. NIFTY, BANKNIFTY, RELIANCE"
            slotProps={{
              htmlInput: {
                list: 'trade-quick-symbol-list',
                style: {
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                },
              },
            }}
          />
          <datalist id="trade-quick-symbol-list">
            {instruments.map((i: any) => (
              <option key={i.symbol} value={i.symbol}>
                {i.displayName || i.symbol} ({i.exchange})
              </option>
            ))}
          </datalist>

          <TextField
            select
            label="Asset Class"
            size="small"
            fullWidth
            value={watch('assetClass') || 'FUTURES'}
            onChange={(e) => {
              const ac = e.target.value;
              setValue('assetClass', ac, { shouldDirty: true });
              if (ac === 'OPTIONS' && !watch('optionType')) {
                setValue('optionType', 'CALL', { shouldDirty: true });
              }
              if (ac === 'COMMODITY' && watch('exchange') !== 'MCX') {
                setValue('exchange', 'MCX', { shouldDirty: true });
                setValue('marketSegment', 'MCX', { shouldDirty: true });
                const entryTime = watch('entryTime');
                if (entryTime) {
                  setValue('session', deriveSessionFromTime(entryTime, 'MCX', 'MCX'), { shouldDirty: true });
                }
              }
            }}
          >
            {ASSET_CLASSES.map((ac) => (
              <MenuItem key={ac.value} value={ac.value}>
                {ac.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Exchange"
            size="small"
            fullWidth
            value={watch('exchange') || 'NSE'}
            onChange={(e) => {
              const ex = e.target.value.toUpperCase();
              setValue('exchange', ex, { shouldDirty: true });
              if (ex === 'MCX') {
                setValue('marketSegment', 'MCX', { shouldDirty: true });
                setValue('assetClass', 'COMMODITY', { shouldDirty: true });
                const entryTime = watch('entryTime');
                if (entryTime) {
                  setValue('session', deriveSessionFromTime(entryTime, 'MCX', 'MCX'), { shouldDirty: true });
                }
              } else if (ex === 'NSE' || ex === 'BSE') {
                const currentAc = watch('assetClass');
                const nextAc = currentAc === 'COMMODITY' ? 'FUTURES' : currentAc;
                setValue('assetClass', nextAc, { shouldDirty: true });
                setValue('marketSegment', nextAc === 'EQUITY' ? `${ex}_EQ` : `${ex}_FNO`, { shouldDirty: true });
              }
            }}
            slotProps={{ htmlInput: { style: { textTransform: 'uppercase', fontFamily: '"JetBrains Mono", monospace' } } }}
          />
        </Box>

        {/* Options Specification Strip (when Asset Class is OPTIONS) */}
        {watch('assetClass') === 'OPTIONS' && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
              p: 1.25,
              px: 1.75,
              borderRadius: 2,
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.05)',
              border: `1px solid ${muiTheme.palette.primary.main}35`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Option Type:
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={watch('optionType') || 'CALL'}
                onChange={(_, val) => val && setValue('optionType', val, { shouldDirty: true })}
                sx={{
                  height: 28,
                  '& .MuiToggleButton-root': {
                    px: 1.5,
                    py: 0.25,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    '&.Mui-selected': {
                      backgroundColor: `${muiTheme.palette.primary.main}25`,
                      color: muiTheme.palette.primary.main,
                      borderColor: muiTheme.palette.primary.main,
                    },
                  },
                }}
              >
                <ToggleButton value="CALL">CE (Call)</ToggleButton>
                <ToggleButton value="PUT">PE (Put)</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Strike Price:
              </Typography>
              <TextField
                size="small"
                type="number"
                placeholder="e.g. 25500"
                value={watch('strikePrice') ?? ''}
                onChange={(e) => setValue('strikePrice', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
                slotProps={{
                  htmlInput: {
                    step: 'any',
                    style: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, padding: '4px 8px', width: 90 },
                  },
                }}
              />
            </Box>

            <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto', fontStyle: 'italic', fontSize: '0.72rem' }}>
              {direction === 'SHORT' && (watch('optionType') === 'PUT' || !watch('optionType'))
                ? '💡 Shorting PE option = Bullish (LONG) underlying market setup'
                : direction === 'LONG' && watch('optionType') === 'PUT'
                ? '💡 Buying PE option = Bearish (SHORT) underlying market setup'
                : direction === 'SHORT' && watch('optionType') === 'CALL'
                ? '💡 Shorting CE option = Bearish (SHORT) underlying market setup'
                : '💡 Buying CE option = Bullish (LONG) underlying market setup'}
            </Typography>
          </Box>
        )}

        {/* Quick Symbol Chips */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem', mr: 0.5 }}>
            Popular:
          </Typography>
          {quickSymbols.map((sym) => (
            <Chip
              key={sym}
              label={sym}
              size="small"
              onClick={() => handleSelectSymbol(sym)}
              variant={selectedSymbol.toUpperCase() === sym ? 'filled' : 'outlined'}
              color={selectedSymbol.toUpperCase() === sym ? 'primary' : 'default'}
              sx={{
                height: 22,
                fontSize: '0.6875rem',
                fontFamily: '"JetBrains Mono", monospace',
                fontWeight: selectedSymbol.toUpperCase() === sym ? 700 : 500,
                cursor: 'pointer',
              }}
            />
          ))}
          {currentInstrument && (
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={`Lot: ${currentInstrument.lotSize} • Mult: x${currentInstrument.contractMultiplier} • Tick: ${currentInstrument.tickSize}`}
                size="small"
                variant="outlined"
                sx={{
                  height: 20,
                  fontSize: '0.625rem',
                  fontFamily: '"JetBrains Mono", monospace',
                  bgcolor: 'action.hover',
                  color: 'text.secondary',
                }}
              />
            </Box>
          )}
        </Box>

        {/* Market-based Rule-Driven Templates Bar */}
        {onApplyTemplatePatch && (
          <MarketTemplateBar
            symbol={selectedSymbol}
            assetClass={watch('assetClass') || 'FUTURES'}
            direction={direction}
            entryPrice={Number(watch('simpleExecution.entryPrice')) || 0}
            entryTime={watch('entryTime')}
            tickSize={currentInstrument?.tickSize || 0.05}
            lotSize={lotSize}
            contractMultiplier={Number(contractMultiplier) || 1}
            dirtyFields={dirtyFields}
            strategies={strategies}
            onApplyTemplatePatch={onApplyTemplatePatch}
            onUndoTemplate={onUndoTemplate}
            hasAppliedTemplate={hasAppliedTemplate}
            appliedTemplateName={appliedTemplateName}
            userTemplates={userTemplates}
          />
        )}
      </Box>

      <Divider sx={{ my: 0.5 }} />

      {/* Row 3: Execution Prices, Lots & Quantity */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.2fr 1.2fr 0.9fr 1.3fr 1fr' }, gap: 2 }}>
        <TextField
          label="Entry Price *"
          type="number"
          size="small"
          required
          fullWidth
          value={watch('simpleExecution.entryPrice') || ''}
          onChange={(e) => {
            const val = e.target.value === '' ? '' : Number(e.target.value);
            setValue('simpleExecution.entryPrice', val, { shouldDirty: true });
            setValue('risk.plannedEntryPrice', val, { shouldDirty: true });
          }}
          slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 } } }}
        />

        <TextField
          label={status === 'OPEN' ? 'Exit Price (Open)' : 'Exit Price *'}
          type="number"
          size="small"
          disabled={status === 'OPEN'}
          fullWidth
          placeholder={status === 'OPEN' ? 'Holding Open' : 'e.g. 24150'}
          value={status === 'OPEN' ? '' : (watch('simpleExecution.exitPrice') || '')}
          onChange={(e) => setValue('simpleExecution.exitPrice', e.target.value === '' ? '' : Number(e.target.value))}
          slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 } } }}
          helperText={status === 'OPEN' ? 'Position is active' : ''}
        />

        {/* Lots Input */}
        <TextField
          label="Lots"
          type="number"
          size="small"
          fullWidth
          value={Number.isInteger(lotsValue) ? lotsValue : Number(lotsValue.toFixed(2))}
          onChange={(e) => handleLotsChange(e.target.value)}
          slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 } } }}
          helperText={lotSize > 1 ? `1 lot = ${lotSize}` : '1 lot = 1'}
        />

        {/* Quantity with Lot Stepper */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField
              label="Quantity *"
              type="number"
              size="small"
              required
              fullWidth
              value={quantity}
              onChange={(e) => setValue('simpleExecution.quantity', Number(e.target.value))}
              slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 } } }}
            />
            <Tooltip title={`Subtract 1 lot (${lotSize} units)`} arrow>
              <span>
                <IconButton
                  size="small"
                  onClick={() => handleStepQuantity(-1)}
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 0.75 }}
                >
                  <RemoveRounded sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={`Add 1 lot (${lotSize} units)`} arrow>
              <span>
                <IconButton
                  size="small"
                  onClick={() => handleStepQuantity(1)}
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 0.75 }}
                >
                  <AddRounded sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          {lotSize > 1 && (
            <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'text.secondary', fontSize: '0.6875rem', pl: 0.5, mt: 0.25, display: 'block' }}>
              = {Math.round(quantity / lotSize)} lot{Math.round(quantity / lotSize) !== 1 ? 's' : ''}
            </Typography>
          )}
        </Box>

        <TextField
          label="Contract Multiplier"
          type="number"
          size="small"
          fullWidth
          value={contractMultiplier}
          onChange={(e) => setValue('simpleExecution.contractMultiplier', Number(e.target.value))}
          slotProps={{ htmlInput: { step: 'any', min: 0.001, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
        />
      </Box>

      {/* Row 4: Risk Parameters (Stop Loss & Target) */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <TextField
            label={
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                <span>Initial Stop Loss</span>
                {provenanceMap['risk.initialStopLoss'] === 'RULE' && (
                  <Chip
                    label="from rule"
                    size="small"
                    variant="outlined"
                    color="primary"
                    sx={{ height: 16, fontSize: '0.5625rem', fontWeight: 700 }}
                  />
                )}
              </Box>
            }
            type="number"
            size="small"
            placeholder="e.g. 23950"
            fullWidth
            value={watch('risk.initialStopLoss') || ''}
            onChange={(e) => setValue('risk.initialStopLoss', e.target.value === '' ? '' : Number(e.target.value))}
            slotProps={{ htmlInput: { step: 'any', style: { fontFamily: '"JetBrains Mono", monospace' } } }}
            helperText={
              manualSlHint ? (
                <Box
                  component="span"
                  sx={{
                    color: 'warning.main',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: '0.6875rem',
                  }}
                >
                  <InfoOutlined sx={{ fontSize: 13 }} />
                  {manualSlHint}
                </Box>
              ) : stopLoss && entryPrice ? (
                `${Math.abs(entryPrice - stopLoss).toFixed(2)} pts stop (${formatCurrency(Math.abs(entryPrice - stopLoss) * quantity * contractMultiplier)} risk)`
              ) : (
                'Defines your risk invalidation'
              )
            }
          />
        </Box>

        <TextField
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <span>Planned Target Price</span>
              {provenanceMap['risk.plannedTarget'] === 'RULE' && (
                <Chip
                  label="from rule"
                  size="small"
                  variant="outlined"
                  color="primary"
                  sx={{ height: 16, fontSize: '0.5625rem', fontWeight: 700 }}
                />
              )}
            </Box>
          }
          type="number"
          size="small"
          placeholder="e.g. 24200"
          fullWidth
          value={watch('risk.plannedTarget') || ''}
          onChange={(e) => setValue('risk.plannedTarget', e.target.value === '' ? '' : Number(e.target.value))}
          slotProps={{ htmlInput: { step: 'any', style: { fontFamily: '"JetBrains Mono", monospace' } } }}
          helperText={
            targetPrice && entryPrice
              ? `${Math.abs(targetPrice - entryPrice).toFixed(2)} pts target (${formatCurrency(Math.abs(targetPrice - entryPrice) * quantity * contractMultiplier)} gain)`
              : 'Target profit objective'
          }
        />

        <TextField
          label="Planned Risk Budget"
          type="number"
          size="small"
          placeholder="e.g. 2500"
          fullWidth
          value={watch('risk.riskBudgetAmount') || ''}
          onChange={(e) => setValue('risk.riskBudgetAmount', e.target.value === '' ? '' : Number(e.target.value))}
          slotProps={{ htmlInput: { step: 'any', style: { fontFamily: '"JetBrains Mono", monospace' } } }}
          helperText="Maximum monetary risk allowed"
        />
      </Box>

      {/* Row 5: Timestamps & Trading Session */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
        <TextField
          label="Trade Date *"
          type="date"
          size="small"
          required
          fullWidth
          value={watch('tradeDate') || ''}
          onChange={(e) => setValue('tradeDate', e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label="Entry Timestamp *"
          type="datetime-local"
          size="small"
          required
          fullWidth
          value={toLocalIsoDateTime(watch('entryTime'))}
          onChange={(e) => {
            setValue('entryTime', e.target.value, { shouldDirty: true });
            const derived = deriveSessionFromTime(e.target.value, watch('exchange'), watch('marketSegment'));
            setValue('session', derived, { shouldDirty: true });
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label="Exit Timestamp"
          type="datetime-local"
          size="small"
          disabled={status === 'OPEN'}
          fullWidth
          value={status === 'OPEN' ? '' : toLocalIsoDateTime(watch('exitTime'))}
          onChange={(e) => setValue('exitTime', e.target.value, { shouldDirty: true })}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          select
          label="Trading Session"
          size="small"
          fullWidth
          value={watch('session') || 'NSE_REGULAR'}
          onChange={(e) => setValue('session', e.target.value)}
        >
          {TRADING_SESSIONS.map((sess) => (
            <MenuItem key={sess.value} value={sess.value}>
              {sess.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Row 6: Strategy, Title & Tags */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1.2fr 1.6fr' }, gap: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <TextField
            select
            label={
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                <span>Strategy Playbook</span>
                {provenanceMap['strategyName'] === 'TEMPLATE' && (
                  <Chip
                    label="from template"
                    size="small"
                    sx={{ height: 16, fontSize: '0.5625rem', fontWeight: 700, bgcolor: 'primary.main', color: '#fff' }}
                  />
                )}
              </Box>
            }
            size="small"
            fullWidth
            value={watch('strategyId') || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val.startsWith('__CREATE__:')) {
                const stratName = val.replace('__CREATE__:', '');
                if (onCreateMissingStrategy) {
                  onCreateMissingStrategy(stratName);
                }
                return;
              }
              setValue('strategyId', val, { shouldDirty: true });
              const found = strategies.find((s) => (s.id || s._id) === val);
              if (found) setValue('strategyName', found.name, { shouldDirty: true });
            }}
          >
            <MenuItem value="">
              <em>None / Discretionary</em>
            </MenuItem>
            {strategies.map((strat) => {
              const stratId = strat.id || strat._id;
              return (
                <MenuItem key={stratId} value={stratId}>
                  {strat.name}
                </MenuItem>
              );
            })}
            {missingStrategyName &&
              !strategies.some(
                (s) => (s.name || '').toLowerCase() === missingStrategyName.toLowerCase()
              ) && (
                <MenuItem
                  value={`__CREATE__:${missingStrategyName}`}
                  sx={{
                    color: 'info.main',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderTop: `1px dashed ${muiTheme.palette.divider}`,
                    mt: 0.5,
                  }}
                >
                  <AddRounded sx={{ fontSize: 16 }} />
                  + Create strategy "{missingStrategyName}"
                </MenuItem>
              )}
          </TextField>

          {/* Missing strategy helper chip */}
          {missingStrategyName && (
            <Box sx={{ mt: 0.75 }}>
              <Chip
                icon={
                  isCreatingStrategy ? (
                    <CircularProgress size={12} color="inherit" sx={{ mr: '4px !important' }} />
                  ) : (
                    <AddRounded sx={{ fontSize: '13px !important' }} />
                  )
                }
                label={
                  isCreatingStrategy
                    ? `Creating strategy "${missingStrategyName}"...`
                    : `+ Create strategy "${missingStrategyName}"`
                }
                size="small"
                color="info"
                variant="outlined"
                disabled={isCreatingStrategy}
                onClick={async () => {
                  if (onCreateMissingStrategy) {
                    await onCreateMissingStrategy(missingStrategyName);
                  } else {
                    setValue('strategyName', missingStrategyName, { shouldDirty: true });
                  }
                }}
                sx={{
                  height: 24,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  cursor: isCreatingStrategy ? 'default' : 'pointer',
                  borderColor: 'info.main',
                  bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(2, 136, 209, 0.08)' : 'rgba(2, 136, 209, 0.04)',
                  '&:hover': {
                    bgcolor: 'info.main',
                    color: '#fff',
                  },
                }}
              />
            </Box>
          )}

          {/* Child Setup Variant Select / Custom Entry */}
          {(() => {
            const stratId = watch('strategyId');
            const currentStrat = strategies.find((s) => (s.id || s._id) === stratId);
            const stratVariants = currentStrat?.variants || [];
            const currentVariantKey = watch('setup.variantKey') || '';
            const currentVariant = stratVariants.find((v: any) => v.key === currentVariantKey);
            const isPredefined = Boolean(currentVariant);

            if (!currentStrat && !currentVariantKey) {
              return null;
            }

            return (
              <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: (theme) => `1px solid ${theme.palette.divider}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AccountTreeRounded sx={{ fontSize: 14, color: 'primary.main' }} /> Setup Variant (Child)
                  </Typography>
                  {stratVariants.length > 0 && (
                    <Chip label={`${stratVariants.length} Available`} size="small" sx={{ height: 16, fontSize: '0.5625rem' }} />
                  )}
                </Box>

                {stratVariants.length > 0 && (
                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="Select Setup Variant"
                    value={isPredefined ? currentVariantKey : (currentVariantKey ? '__CUSTOM__' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CUSTOM__') {
                        return;
                      }
                      setValue('setup.variantKey', val || undefined, { shouldDirty: true });
                      setValue('setup.variantStatus', val ? 'CLASSIFIED' : 'UNCLASSIFIED', { shouldDirty: true });
                    }}
                  >
                    <MenuItem value="">
                      <em>No Variant (Unclassified)</em>
                    </MenuItem>
                    {stratVariants.map((v: any) => (
                      <MenuItem key={v.key} value={v.key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <span>{v.name} ({v.key})</span>
                        {!v.isActive && <Chip label="Archived" size="small" sx={{ height: 16, fontSize: '0.5625rem' }} />}
                      </MenuItem>
                    ))}
                    <MenuItem value="__CUSTOM__" sx={{ borderTop: (theme) => `1px dashed ${theme.palette.divider}`, fontStyle: 'italic', color: 'primary.main' }}>
                      + Enter Custom Variant Key...
                    </MenuItem>
                  </TextField>
                )}

                {/* Custom variant key input if user entered custom key or no variants exist on strategy */}
                {(!isPredefined || stratVariants.length === 0) && (
                  <TextField
                    size="small"
                    fullWidth
                    label="Custom Setup Variant Key"
                    placeholder="e.g. VAR-01, ORB-5M, BULL-SSL-EQL"
                    value={currentVariantKey}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setValue('setup.variantKey', val || undefined, { shouldDirty: true });
                      setValue('setup.variantStatus', val ? 'CLASSIFIED' : 'UNCLASSIFIED', { shouldDirty: true });
                    }}
                    sx={{ mt: stratVariants.length > 0 ? 1 : 0 }}
                    helperText="Custom variant identifier for this trade"
                  />
                )}

                {currentVariant && (
                  <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {currentVariant.expected?.direction && (
                      <Chip label={`Dir: ${currentVariant.expected.direction}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                    )}
                    {currentVariant.expected?.patternType && (
                      <Chip label={`Pattern: ${currentVariant.expected.patternType}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                    )}
                    {currentVariant.expected?.secondLegStatus && currentVariant.expected.secondLegStatus !== 'NOT_APPLICABLE' && (
                      <Chip label={`Leg: ${currentVariant.expected.secondLegStatus}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.625rem' }} />
                    )}
                    {currentVariant.minRiskReward !== null && currentVariant.minRiskReward !== undefined && (
                      <Chip label={`Min R:R 1:${currentVariant.minRiskReward}`} size="small" variant="outlined" color="primary" sx={{ height: 18, fontSize: '0.625rem' }} />
                    )}
                  </Box>
                )}
              </Box>
            );
          })()}
        </Box>

        <TextField
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <span>Trade Setup Title</span>
              {provenanceMap['tradeTitle'] === 'TEMPLATE' && (
                <Chip
                  label="from template"
                  size="small"
                  sx={{ height: 16, fontSize: '0.5625rem', fontWeight: 700, bgcolor: 'primary.main', color: '#fff' }}
                />
              )}
            </Box>
          }
          size="small"
          placeholder="e.g. 5m FVG Bounce"
          fullWidth
          value={watch('tradeTitle') || ''}
          onChange={(e) => setValue('tradeTitle', e.target.value)}
        />

        <TextField
          label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <span>Tags (Comma-separated)</span>
              {provenanceMap['tags'] && (
                <Chip
                  label="from template"
                  size="small"
                  sx={{ height: 16, fontSize: '0.5625rem', fontWeight: 700, bgcolor: 'primary.main', color: '#fff' }}
                />
              )}
            </Box>
          }
          size="small"
          placeholder="e.g. A-PLUS, MOMENTUM, S&R"
          fullWidth
          value={watch('tagsInput') || ''}
          onChange={(e) => setValue('tagsInput', e.target.value)}
          slotProps={{
            input: {
              startAdornment: <LocalOfferRounded sx={{ fontSize: 16, color: 'text.secondary', mr: 0.5 }} />,
            },
          }}
        />
      </Box>

      {/* Itemized Fees Expander */}
      <Box sx={{ pt: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button
            size="small"
            color="inherit"
            onClick={() => setShowItemizedFees(!showItemizedFees)}
            endIcon={showItemizedFees ? <ExpandLessRounded /> : <ExpandMoreRounded />}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary', p: 0 }}
          >
            {showItemizedFees ? 'Hide Itemized Execution Fees' : 'Itemized Execution Fees (Brokerage, Taxes, Exchange)'}
          </Button>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={<SecurityRounded sx={{ fontSize: '13px !important' }} />}
              label={isAutoFees ? 'AUTO FEES' : 'MANUAL OVERRIDE'}
              size="small"
              color={isAutoFees ? 'success' : 'warning'}
              variant={isAutoFees ? 'filled' : 'outlined'}
              sx={{ height: 20, fontSize: '0.625rem', fontWeight: 700 }}
            />
            {!isAutoFees && onResetAutoFees && (
              <Button
                size="small"
                variant="text"
                onClick={onResetAutoFees}
                startIcon={<RotateLeftRounded sx={{ fontSize: 14 }} />}
                sx={{ textTransform: 'none', fontSize: '0.6875rem', py: 0, px: 0.75, height: 20 }}
              >
                Reset to auto
              </Button>
            )}
          </Box>
        </Box>

        <Collapse in={showItemizedFees}>
          <Box
            sx={{
              p: 2,
              mt: 1.5,
              borderRadius: 2,
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
                {isAutoFees
                  ? 'Charges auto-calculated: Flat ₹20/leg brokerage, exchange turnover, STT/CTT, SEBI (₹10/cr), stamp duty, and 18% GST'
                  : 'Manual fee overrides active. Click "Reset to auto" to restore statutory calculations.'}
              </Typography>
              {!isAutoFees && onResetAutoFees && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onResetAutoFees}
                  startIcon={<RotateLeftRounded sx={{ fontSize: 14 }} />}
                  sx={{ textTransform: 'none', fontSize: '0.6875rem', py: 0.25, px: 1 }}
                >
                  Reset to auto
                </Button>
              )}
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr 1fr' },
                gap: 2,
              }}
            >
              <TextField
                label="Brokerage"
                type="number"
                size="small"
                fullWidth
                value={watch('simpleExecution.brokerage') ?? 0}
                onChange={(e) => {
                  onToggleAutoFees?.(false);
                  setValue('simpleExecution.brokerage', Number(e.target.value));
                }}
                slotProps={{ htmlInput: { step: 'any', min: 0, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
              <TextField
                label="Exchange Fees"
                type="number"
                size="small"
                fullWidth
                value={watch('simpleExecution.exchangeFees') ?? 0}
                onChange={(e) => {
                  onToggleAutoFees?.(false);
                  setValue('simpleExecution.exchangeFees', Number(e.target.value));
                }}
                slotProps={{ htmlInput: { step: 'any', min: 0, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
              <TextField
                label="Regulatory (SEBI)"
                type="number"
                size="small"
                fullWidth
                value={watch('simpleExecution.regulatoryFees') ?? 0}
                onChange={(e) => {
                  onToggleAutoFees?.(false);
                  setValue('simpleExecution.regulatoryFees', Number(e.target.value));
                }}
                slotProps={{ htmlInput: { step: 'any', min: 0, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
              <TextField
                label="Taxes (GST/STT)"
                type="number"
                size="small"
                fullWidth
                value={watch('simpleExecution.taxes') ?? 0}
                onChange={(e) => {
                  onToggleAutoFees?.(false);
                  setValue('simpleExecution.taxes', Number(e.target.value));
                }}
                slotProps={{ htmlInput: { step: 'any', min: 0, style: { fontFamily: '"JetBrains Mono", monospace' } } }}
              />
              <TextField
                label="Explicit Adjustments"
                type="number"
                size="small"
                fullWidth
                value={watch('simpleExecution.explicitAdjustments') ?? 0}
                onChange={(e) => setValue('simpleExecution.explicitAdjustments', Number(e.target.value))}
                slotProps={{ htmlInput: { step: 'any', style: { fontFamily: '"JetBrains Mono", monospace' } } }}
                helperText="Dividends / Carry"
              />
            </Box>
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}
