import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import KeyboardAltRoundedIcon from '@mui/icons-material/KeyboardAltRounded';
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import DangerousRoundedIcon from '@mui/icons-material/DangerousRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';

export interface HotkeyCheatSheetDialogProps {
  open: boolean;
  onClose: () => void;
}

interface HotkeyItem {
  key: string;
  action: string;
  description: string;
  category: 'EXECUTION' | 'NAVIGATION' | 'VIEW';
  danger?: boolean;
}

const HOTKEYS: HotkeyItem[] = [
  {
    key: 'B',
    action: 'Lock True Breakeven',
    description: 'Trails stop loss to entry price + exchange statutory charges cushion on the highest priority open position.',
    category: 'EXECUTION',
  },
  {
    key: 'Space',
    action: 'Book 50% Partial',
    description: 'Opens pre-flight preview to scale out 50% lot-aware quantity at current market price on top position.',
    category: 'EXECUTION',
  },
  {
    key: 'K',
    action: 'Panic Kill Switch',
    description: 'Prompts immediate market emergency exit modal to flatten all open positions and cancel pending broker orders.',
    category: 'EXECUTION',
    danger: true,
  },
  {
    key: '1',
    action: 'Glance Density',
    description: 'Switches view to ultra-compact Glance layout (symbol, net P&L, unrealized R, and SL distance).',
    category: 'VIEW',
  },
  {
    key: '2',
    action: 'Standard Density',
    description: 'Switches view to Standard layout with scaling ladder and giveback meter tabs.',
    category: 'VIEW',
  },
  {
    key: '3',
    action: 'Deep Density',
    description: 'Switches view to full quant cockpit with Options Greeks, MFE/MAE stagnation, and pulse timeline.',
    category: 'VIEW',
  },
  {
    key: 'V',
    action: 'Toggle Ladder View',
    description: 'Toggles between Classic Gauge and the Vertical Unified Price Ladder.',
    category: 'VIEW',
  },
  {
    key: 'U',
    action: 'Toggle Sort Order',
    description: 'Toggles sorting between Urgency (Breached > Critical > Leaking > Safe) and Entry Time.',
    category: 'VIEW',
  },
  {
    key: 'P',
    action: 'Cycle Layout Preset',
    description: 'Cycles active layout between Scalping (1s), Positional (30s), and Deep Analytics (5s).',
    category: 'NAVIGATION',
  },
  {
    key: '?',
    action: 'Show Hotkey Cheat Sheet',
    description: 'Displays this overlay reference at any time during active trading.',
    category: 'NAVIGATION',
  },
  {
    key: 'Esc',
    action: 'Dismiss Dialog / Modal',
    description: 'Cancels the open execution dialog or closes overlays safely without placing orders.',
    category: 'NAVIGATION',
  },
];

export const HotkeyCheatSheetDialog: React.FC<HotkeyCheatSheetDialogProps> = ({ open, onClose }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          p: 2.5,
          pb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <KeyboardAltRoundedIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
              Live Watcher Keyboard Shortcuts
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
              Execution keys trigger hold-to-confirm safety paths to prevent accidental fills
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 2.5, maxHeight: 500, overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Quick Execution Hotkeys */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <FlashOnRoundedIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Rapid Execution (Hold-to-Confirm)
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {HOTKEYS.filter((h) => h.category === 'EXECUTION').map((hk) => (
                <Card
                  key={hk.key}
                  variant="outlined"
                  sx={{
                    p: 1.25,
                    px: 1.75,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 1.5,
                    bgcolor: hk.danger ? 'rgba(239, 68, 68, 0.04)' : 'background.default',
                    borderColor: hk.danger ? 'rgba(239, 68, 68, 0.3)' : 'divider',
                  }}
                >
                  <Box sx={{ pr: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {hk.action}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', display: 'block', mt: 0.25 }}>
                      {hk.description}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      px: 1.2,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: 'action.selected',
                      border: '1px solid',
                      borderColor: 'divider',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      color: hk.danger ? '#ef4444' : 'text.primary',
                      minWidth: 32,
                      textAlign: 'center',
                      boxShadow: '0 2px 0 rgba(0,0,0,0.2)',
                    }}
                  >
                    {hk.key}
                  </Box>
                </Card>
              ))}
            </Box>
          </Box>

          <Divider />

          {/* View & Density Hotkeys */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TuneRoundedIcon sx={{ fontSize: 16, color: '#3b82f6' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                View & Density Controls
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {HOTKEYS.filter((h) => h.category === 'VIEW').map((hk) => (
                <Card
                  key={hk.key}
                  variant="outlined"
                  sx={{
                    p: 1.25,
                    px: 1.75,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 1.5,
                    bgcolor: 'background.default',
                  }}
                >
                  <Box sx={{ pr: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {hk.action}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', display: 'block', mt: 0.25 }}>
                      {hk.description}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      px: 1.2,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: 'action.selected',
                      border: '1px solid',
                      borderColor: 'divider',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      color: 'text.primary',
                      minWidth: 32,
                      textAlign: 'center',
                      boxShadow: '0 2px 0 rgba(0,0,0,0.2)',
                    }}
                  >
                    {hk.key}
                  </Box>
                </Card>
              ))}
            </Box>
          </Box>

          <Divider />

          {/* Navigation Hotkeys */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <SecurityRoundedIcon sx={{ fontSize: 16, color: '#10b981' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Navigation & Safety
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {HOTKEYS.filter((h) => h.category === 'NAVIGATION').map((hk) => (
                <Card
                  key={hk.key}
                  variant="outlined"
                  sx={{
                    p: 1.25,
                    px: 1.75,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 1.5,
                    bgcolor: 'background.default',
                  }}
                >
                  <Box sx={{ pr: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {hk.action}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem', display: 'block', mt: 0.25 }}>
                      {hk.description}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      px: 1.2,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: 'action.selected',
                      border: '1px solid',
                      borderColor: 'divider',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      color: 'text.primary',
                      minWidth: 32,
                      textAlign: 'center',
                      boxShadow: '0 2px 0 rgba(0,0,0,0.2)',
                    }}
                  >
                    {hk.key}
                  </Box>
                </Card>
              ))}
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, px: 2.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={onClose} variant="contained" size="small" sx={{ fontWeight: 700, textTransform: 'none', px: 2.5 }}>
          Got It
        </Button>
      </DialogActions>
    </Dialog>
  );
};
