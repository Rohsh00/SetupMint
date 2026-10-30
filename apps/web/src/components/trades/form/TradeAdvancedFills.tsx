import React from 'react';
import { UseFormRegister, UseFormWatch, UseFieldArrayReturn, UseFormSetValue } from 'react-hook-form';
import {
  Box,
  Typography,
  Button,
  Card,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  TextField,
  Chip,
  Alert,
  Divider,
  useTheme,
} from '@mui/material';
import {
  AddRounded,
  DeleteOutlineRounded,
  CallReceivedRounded,
  CallMadeRounded,
  LayersRounded,
  CheckCircleRounded,
  WarningAmberRounded,
} from '@mui/icons-material';
import { calculateFIFOExecution } from '@tradevault/financial-engine';
import { formatCurrency, toLocalIsoDateTime, currentLocalIsoDateTime } from '../../../lib/utils.js';
import { HelpHint } from '../../help/index.js';

interface TradeAdvancedFillsProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue?: UseFormSetValue<any>;
  fillsFieldArray: UseFieldArrayReturn<any, 'fills'>;
}

export function TradeAdvancedFills({
  register,
  watch,
  setValue,
  fillsFieldArray,
}: TradeAdvancedFillsProps) {
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';
  const { fields, append, remove } = fillsFieldArray;

  const direction = watch('direction') || 'LONG';
  const contractMultiplier = watch('simpleExecution.contractMultiplier') || 1;
  const watchedFills = watch('fills') || [];

  const handleAddFill = (type: 'ENTRY' | 'EXIT') => {
    append({
      fillId: `fill-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type,
      price: watch('simpleExecution.entryPrice') || 100,
      quantity: 1,
      timestamp: currentLocalIsoDateTime(),
      fee: 20,
      notes: '',
    });
  };

  // Run FIFO calculation if fills exist
  let fifoSummary: any = null;
  let fifoError: string | null = null;

  if (watchedFills.length > 0) {
    try {
      fifoSummary = calculateFIFOExecution(direction, watchedFills, contractMultiplier);
    } catch (err: any) {
      fifoError = err.message || 'FIFO Calculation error';
    }
  }

  // Check if exit quantity > entry quantity
  const totalEntries = watchedFills
    .filter((f: any) => f.type === 'ENTRY')
    .reduce((sum: number, f: any) => sum + (Number(f.quantity) || 0), 0);
  const totalExits = watchedFills
    .filter((f: any) => f.type === 'EXIT')
    .reduce((sum: number, f: any) => sum + (Number(f.quantity) || 0), 0);

  const hasOversold = totalExits > totalEntries;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Header & Add Fill Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Execution Fills (FIFO Matching)
            </Typography>
            <HelpHint hintKey="trade.form.fifo" />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Log multiple entry scale-ins and staggered profit targets with chronological matching
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={<CallReceivedRounded sx={{ fontSize: 16 }} />}
            onClick={() => handleAddFill('ENTRY')}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          >
            Add Entry Fill
          </Button>

          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<CallMadeRounded sx={{ fontSize: 16, color: muiTheme.palette.loss.main }} />}
            onClick={() => handleAddFill('EXIT')}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          >
            Add Exit Fill
          </Button>
        </Box>
      </Box>

      {/* Oversold Validation Alert */}
      {hasOversold && (
        <Alert severity="error" icon={<WarningAmberRounded />} sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 600 }}>
          Total exit quantity ({totalExits}) exceeds total entry quantity ({totalEntries}). An execution cannot exit more than entered.
        </Alert>
      )}

      {/* Fills List Table */}
      {fields.length === 0 ? (
        <Card
          variant="outlined"
          sx={{
            p: 4,
            textAlign: 'center',
            borderStyle: 'dashed',
            bgcolor: 'action.hover',
          }}
        >
          <LayersRounded sx={{ fontSize: 36, color: 'text.secondary', mb: 1, opacity: 0.6 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            No Detailed Fills Added
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Switch to simple mode above or click below to start scaling into multiple lots
          </Typography>
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={() => handleAddFill('ENTRY')}
            startIcon={<AddRounded />}
          >
            Add First Entry Fill
          </Button>
        </Card>
      ) : (
        <Card variant="outlined" sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, py: 1 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1 }}>Price</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1 }}>Quantity</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1 }}>Timestamp</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1 }}>Fee</TableCell>
                <TableCell sx={{ fontWeight: 600, py: 1 }}>Notes</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, py: 1 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((field, index) => {
                const fillType = watch(`fills.${index}.type`);
                const isEntry = fillType === 'ENTRY';
                const rawTs = watch(`fills.${index}.timestamp`);
                const formattedTs = toLocalIsoDateTime(rawTs);

                return (
                  <TableRow key={field.id} hover>
                    <TableCell sx={{ py: 1 }}>
                      <Chip
                        label={isEntry ? 'ENTRY' : 'EXIT'}
                        size="small"
                        color={isEntry ? 'primary' : 'error'}
                        variant={isEntry ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 700, fontSize: '0.625rem', height: 20 }}
                      />
                    </TableCell>

                    <TableCell sx={{ py: 1 }}>
                      <TextField
                        type="number"
                        size="small"
                        {...register(`fills.${index}.price`, { valueAsNumber: true, required: true })}
                        slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { width: 90, fontFamily: '"JetBrains Mono", monospace' } } }}
                      />
                    </TableCell>

                    <TableCell sx={{ py: 1 }}>
                      <TextField
                        type="number"
                        size="small"
                        {...register(`fills.${index}.quantity`, { valueAsNumber: true, required: true })}
                        slotProps={{ htmlInput: { step: 'any', min: 0.0001, style: { width: 70, fontFamily: '"JetBrains Mono", monospace' } } }}
                      />
                    </TableCell>

                    <TableCell sx={{ py: 1 }}>
                      <TextField
                        type="datetime-local"
                        size="small"
                        value={formattedTs}
                        onChange={(e) => {
                          if (setValue) {
                            setValue(`fills.${index}.timestamp`, e.target.value, { shouldDirty: true, shouldValidate: true });
                          } else {
                            register(`fills.${index}.timestamp`).onChange(e);
                          }
                        }}
                        slotProps={{ htmlInput: { style: { fontSize: '0.75rem' } } }}
                      />
                    </TableCell>

                    <TableCell sx={{ py: 1 }}>
                      <TextField
                        type="number"
                        size="small"
                        value={watch(`fills.${index}.fee`) ?? 0}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : Number(e.target.value);
                          if (setValue) {
                            setValue(`fills.${index}.fee`, val, { shouldDirty: true });
                          } else {
                            register(`fills.${index}.fee`).onChange(e);
                          }
                        }}
                        slotProps={{ htmlInput: { step: 'any', min: 0, style: { width: 60, fontFamily: '"JetBrains Mono", monospace' } } }}
                      />
                    </TableCell>

                    <TableCell sx={{ py: 1 }}>
                      <TextField
                        size="small"
                        placeholder="Rationale/Tag"
                        {...register(`fills.${index}.notes`)}
                        slotProps={{ htmlInput: { style: { fontSize: '0.75rem' } } }}
                      />
                    </TableCell>

                    <TableCell align="right" sx={{ py: 1 }}>
                      <IconButton size="small" color="error" onClick={() => remove(index)}>
                        <DeleteOutlineRounded sx={{ fontSize: 18 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Live FIFO Reconciliation Summary */}
      {fifoSummary && (
        <Card
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', display: 'block', mb: 1.5 }}
          >
            Live FIFO Execution Reconciliation
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 1.5, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem' }}>
            <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>TOTAL ENTRY QTY</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'inherit' }}>
                {fifoSummary.totalEntryQuantity.toString()}
              </Typography>
            </Box>

            <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>TOTAL EXIT QTY</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'inherit' }}>
                {fifoSummary.totalExitQuantity.toString()}
              </Typography>
            </Box>

            <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>REMAINING OPEN</Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  color: fifoSummary.openQuantity.greaterThan(0) ? muiTheme.palette.info.main : 'text.secondary',
                }}
              >
                {fifoSummary.openQuantity.toString()}
              </Typography>
            </Box>

            <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>AVG ENTRY PRICE</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'inherit' }}>
                {fifoSummary.weightedAvgEntryPrice.toFixed(2)}
              </Typography>
            </Box>

            {fifoSummary.weightedAvgExitPrice && (
              <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>AVG EXIT PRICE</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'inherit' }}>
                  {fifoSummary.weightedAvgExitPrice.toFixed(2)}
                </Typography>
              </Box>
            )}

            <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.625rem' }}>REALIZED GROSS P&L</Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  color: fifoSummary.realizedGrossPnL.greaterThan(0) ? muiTheme.palette.profit.main : fifoSummary.realizedGrossPnL.lessThan(0) ? muiTheme.palette.loss.main : 'text.primary',
                }}
              >
                {formatCurrency(fifoSummary.realizedGrossPnL.toNumber())}
              </Typography>
            </Box>
          </Box>
        </Card>
      )}
    </Box>
  );
}
