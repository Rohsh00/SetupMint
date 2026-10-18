import React, { useState } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  AutoAwesomeRounded,
  BookmarkAddRounded,
  DeleteOutlineRounded,
  RestartAltRounded,
  LayersRounded,
  CloseRounded,
  CheckRounded,
} from '@mui/icons-material';
import {
  getAllTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  TradeSetupTemplate,
} from '../tradeTemplates.js';

interface TradeTemplateSelectorProps {
  onSelectTemplate: (template: TradeSetupTemplate) => void;
  onResetDefaults: () => void;
  getCurrentFormStateForTemplate: () => Omit<TradeSetupTemplate, 'id' | 'isBuiltIn'>;
}

export function TradeTemplateSelector({
  onSelectTemplate,
  onResetDefaults,
  getCurrentFormStateForTemplate,
}: TradeTemplateSelectorProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templates, setTemplates] = useState<TradeSetupTemplate[]>(getAllTemplates);

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setTemplates(getAllTemplates());
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleApply = (tpl: TradeSetupTemplate) => {
    onSelectTemplate(tpl);
    handleCloseMenu();
  };

  const handleOpenSaveDialog = () => {
    handleCloseMenu();
    setTemplateName('');
    setTemplateDesc('');
    setIsSaveModalOpen(true);
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;

    const currentData = getCurrentFormStateForTemplate();
    saveCustomTemplate({
      ...currentData,
      name: templateName.trim(),
      description: templateDesc.trim() || 'Custom user trading setup template',
    });

    setTemplates(getAllTemplates());
    setTemplateName('');
    setTemplateDesc('');
    setIsSaveModalOpen(false);
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteCustomTemplate(id);
    setTemplates(getAllTemplates());
  };

  const builtInList = templates.filter((t) => t.isBuiltIn);
  const customList = templates.filter((t) => !t.isBuiltIn);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        startIcon={<AutoAwesomeRounded sx={{ color: 'primary.main', fontSize: 16 }} />}
        onClick={handleOpenMenu}
        sx={{
          borderRadius: 2,
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'none',
          py: 0.5,
          px: 1.5,
          color: 'text.secondary',
        }}
      >
        Setup Templates
      </Button>

      {/* Templates Dropdown Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        slotProps={{
          paper: {
            sx: {
              width: 320,
              maxHeight: 450,
              borderRadius: 2,
              p: 0.5,
              backgroundImage: 'none',
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
            Setup Presets & Templates
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Quick-load strategy, rules, and instrument metadata
          </Typography>
        </Box>

        <Divider sx={{ my: 0.5 }} />

        {/* Built-in Presets */}
        <Typography
          variant="caption"
          sx={{ px: 2, py: 0.5, color: 'text.secondary', fontWeight: 700, fontSize: '0.625rem', letterSpacing: '0.05em', display: 'block' }}
        >
          BUILT-IN INSTITUTIONAL SETUPS
        </Typography>

        {builtInList.map((t) => (
          <MenuItem
            key={t.id}
            onClick={() => handleApply(t)}
            sx={{
              borderRadius: 1.5,
              mx: 0.5,
              my: 0.25,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                {t.name}
              </Typography>
              <Chip
                label={t.symbol}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.625rem', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem' }}>
              {t.description}
            </Typography>
          </MenuItem>
        ))}

        {/* Custom Presets */}
        {customList.length > 0 && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography
              variant="caption"
              sx={{ px: 2, py: 0.5, color: 'text.secondary', fontWeight: 700, fontSize: '0.625rem', letterSpacing: '0.05em', display: 'block' }}
            >
              MY CUSTOM TEMPLATES
            </Typography>
            {customList.map((t) => (
              <MenuItem
                key={t.id}
                onClick={() => handleApply(t)}
                sx={{
                  borderRadius: 1.5,
                  mx: 0.5,
                  my: 0.25,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                    {t.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem', display: 'block' }}>
                    {t.symbol} • {t.strategyName || 'Custom'}
                  </Typography>
                </Box>
                <Tooltip title="Delete template" arrow>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => handleDeleteTemplate(t.id, e)}
                    sx={{ p: 0.5 }}
                  >
                    <DeleteOutlineRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </MenuItem>
            ))}
          </>
        )}

        <Divider sx={{ my: 0.5 }} />

        {/* Actions */}
        <MenuItem onClick={handleOpenSaveDialog} sx={{ borderRadius: 1.5, mx: 0.5, py: 1 }}>
          <ListItemIcon>
            <BookmarkAddRounded sx={{ fontSize: 18, color: 'primary.main' }} />
          </ListItemIcon>
          <ListItemText primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>Save Current Setup as Template</Typography>} />
        </MenuItem>

        <MenuItem
          onClick={() => {
            onResetDefaults();
            handleCloseMenu();
          }}
          sx={{ borderRadius: 1.5, mx: 0.5, py: 1 }}
        >
          <ListItemIcon>
            <RestartAltRounded sx={{ fontSize: 18, color: 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText primary={<Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>Reset to Standard Defaults</Typography>} />
        </MenuItem>
      </Menu>

      {/* Save Template Modal */}
      <Dialog
        open={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 2, backgroundImage: 'none' } },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Save Setup Template</Typography>
            <Typography variant="caption" color="text.secondary">
              Save current strategy, symbol, session, and confluences
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setIsSaveModalOpen(false)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>

        <form onSubmit={handleSaveSubmit}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Template Name *"
              size="small"
              required
              fullWidth
              autoFocus
              placeholder="e.g. Nifty Morning Breakout"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <TextField
              label="Description (Optional)"
              size="small"
              fullWidth
              placeholder="e.g. 5m FVG retest with trend alignment"
              value={templateDesc}
              onChange={(e) => setTemplateDesc(e.target.value)}
            />
            <Typography variant="caption" color="text.secondary">
              Note: Trade prices, dates, timestamps, and actual executions are NOT saved in templates.
            </Typography>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setIsSaveModalOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary">
              Save Template
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
