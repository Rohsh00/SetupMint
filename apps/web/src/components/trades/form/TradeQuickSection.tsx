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
} from '@mui/icons-material';
import {
  ASSET_CLASSES,
  MARKET_SEGMENTS,
  TRADING_SESSIONS,
  ITradeTemplate,
  TemplatePatch,
  ProvenanceSource,
} from '@tradevault/shared';
import { deriveSessionFromTime } from '@tradevault/financial-engine';
import { formatCurrency } from '../../../lib/utils.js';
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
  userTemplates = [],
}: TradeQuickSectionProps) {
  const muiTheme = useTheme();
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
      const computed = Math.max(1, Math.round(l * step));
      setValue('simpleExecution.quantity', computed);
    }
  };

  // Change symbol and auto-populate metadata
  const handleSelectSymbol = (sym: string) => {
    setValue('symbol', sym.toUpperCase());
    const found = instruments.find((i) => i.symbol.toUpperCase() === sym.toUpperCase());
    if (found) {
      setValue('assetClass', found.assetClass);
      setValue('exchange', found.exchange);
      setValue('marketSegment', found.marketSegment);
      setValue('currency', found.quoteCurrency || 'INR');
      setValue('simpleExecution.contractMultiplier', found.contractMultiplier || 1);
      setValue('risk.lotSize', found.lotSize || 1);
      if (!watch('simpleExecution.quantity') || watch('simpleExecution.quantity') === 1) {
        setValue('simpleExecution.quantity', found.lotSize || 1);
      }
      const entryTime = watch('entryTime');
      if (entryTime) {
        setValue('session', deriveSessionFromTime(entryTime, found.exchange, found.marketSegment));
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

  // Quick preset symbols
  const quickSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'RELIANCE', 'CRUDEOIL', 'GOLD', 'BTCUSDT'];

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
                style: {
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                },
              },
            }}
          />

          <TextField
            select
            label="Asset Class"
            size="small"
            fullWidth
            value={watch('assetClass') || 'FUTURES'}
            onChange={(e) => setValue('assetClass', e.target.value)}
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
            onChange={(e) => setValue('exchange', e.target.value.toUpperCase())}
            slotProps={{ htmlInput: { style: { textTransform: 'uppercase', fontFamily: '"JetBrains Mono", monospace' } } }}
          />
        </Box>

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
            currentValues={watch()}
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
            setValue('simpleExecution.entryPrice', val);
            if (!watch('risk.plannedEntryPrice')) {
              setValue('risk.plannedEntryPrice', val);
            }
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
          slotProps={{ htmlInput: { step: 1, min: 0.01, style: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 } } }}
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
              slotProps={{ htmlInput: { step: lotSize || 1, min: 1, style: { fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 } } }}
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
          value={watch('entryTime') || ''}
          onChange={(e) => {
            setValue('entryTime', e.target.value);
            const derived = deriveSessionFromTime(e.target.value, watch('exchange'), watch('marketSegment'));
            setValue('session', derived);
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label="Exit Timestamp"
          type="datetime-local"
          size="small"
          disabled={status === 'OPEN'}
          fullWidth
          value={status === 'OPEN' ? '' : (watch('exitTime') || '')}
          onChange={(e) => setValue('exitTime', e.target.value)}
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
              setValue('strategyId', e.target.value);
              const found = strategies.find((s) => s.id === e.target.value);
              if (found) setValue('strategyName', found.name);
            }}
          >
            <MenuItem value="">
              <em>None / Discretionary</em>
            </MenuItem>
            {strategies.map((strat) => (
              <MenuItem key={strat.id} value={strat.id}>
                {strat.name}
              </MenuItem>
            ))}
          </TextField>

          {/* Missing strategy helper chip */}
          {missingStrategyName && (
            <Box sx={{ mt: 0.75 }}>
              <Chip
                icon={<AddRounded sx={{ fontSize: '13px !important' }} />}
                label={`Create strategy "${missingStrategyName}"`}
                size="small"
                color="info"
                variant="outlined"
                onClick={() => {
                  setValue('strategyName', missingStrategyName, { shouldDirty: true });
                }}
                sx={{
                  height: 22,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'info.main', color: '#fff' },
                }}
              />
            </Box>
          )}
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
