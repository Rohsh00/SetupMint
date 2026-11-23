import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Button,
} from '@mui/material';

export interface InstrumentOverrideDialogProps {
  open: boolean;
  onClose: () => void;
  isEditing: boolean;
  symbol: string;
  onSymbolChange: (val: string) => void;
  htf: string;
  onHtfChange: (val: string) => void;
  ltf: string;
  onLtfChange: (val: string) => void;
  preferredStrategyId: string;
  onPreferredStrategyIdChange: (val: string) => void;
  userStrategies: any[];
  onSave: () => void;
}

export function InstrumentOverrideDialog({
  open,
  onClose,
  isEditing,
  symbol,
  onSymbolChange,
  htf,
  onHtfChange,
  ltf,
  onLtfChange,
  preferredStrategyId,
  onPreferredStrategyIdChange,
  userStrategies,
  onSave,
}: InstrumentOverrideDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ fontWeight: 700 }}>
        {isEditing ? 'Edit Instrument Override' : 'Add Instrument Override'}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField
          label="Underlying Symbol *"
          size="small"
          required
          fullWidth
          placeholder="e.g. NIFTY, BANKNIFTY, CRUDEOIL"
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value.toUpperCase().trim())}
          slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono", monospace' } } }}
        />

        <TextField
          select
          label="Higher Timeframe (HTF) Trend"
          size="small"
          fullWidth
          value={htf}
          onChange={(e) => onHtfChange(e.target.value)}
        >
          <MenuItem value="60">1 Hour (60m)</MenuItem>
          <MenuItem value="240">4 Hours (240m) — Recommended</MenuItem>
          <MenuItem value="D">Daily (1D)</MenuItem>
        </TextField>

        <TextField
          select
          label="Lower Timeframe (LTF) Confirmation"
          size="small"
          fullWidth
          value={ltf}
          onChange={(e) => onLtfChange(e.target.value)}
        >
          <MenuItem value="1">1 Minute (1m)</MenuItem>
          <MenuItem value="3">3 Minutes (3m)</MenuItem>
          <MenuItem value="5">5 Minutes (5m) — Recommended</MenuItem>
          <MenuItem value="15">15 Minutes (15m)</MenuItem>
        </TextField>

        <TextField
          select
          label="Preferred Strategy (Optional)"
          size="small"
          fullWidth
          value={preferredStrategyId}
          onChange={(e) => onPreferredStrategyIdChange(e.target.value)}
        >
          <MenuItem value="">Dynamic Pattern Match (No Preference)</MenuItem>
          {userStrategies.map((strat: any) => (
            <MenuItem key={strat._id || strat.id} value={strat._id || strat.id}>
              {strat.name}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onSave}
          variant="contained"
          color="primary"
          disabled={!symbol.trim()}
          sx={{ fontWeight: 600 }}
        >
          Save Override
        </Button>
      </DialogActions>
    </Dialog>
  );
}
