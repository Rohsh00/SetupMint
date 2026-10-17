import React from 'react';
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
} from '@mui/material';
import {
  TrendingUpRounded,
  TrendingDownRounded,
  PsychologyRounded,
  CheckCircleRounded,
  WarningAmberRounded,
  AutoAwesomeRounded,
  MenuBookRounded,
} from '@mui/icons-material';
import {
  CONFLUENCES,
  EMOTIONS,
  MISTAKE_TAGS,
} from '@tradevault/shared';

interface TradeJournalDetailsProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}

export function TradeJournalDetails({
  register,
  watch,
  setValue,
}: TradeJournalDetailsProps) {
  const muiTheme = useTheme();

  const preMarketBias = watch('thesis.preMarketBias') || 'BULLISH';
  const marketStructure = watch('thesis.marketStructure') || 'TRENDING_UP';
  const selectedConfluences: string[] = watch('thesis.confluences') || [];
  const disciplineScore = watch('psychology.disciplineScore') ?? 4;
  const selectedMistakes: string[] = watch('psychology.mistakes') || [];

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

        {/* Technical Confluences Checklist */}
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
            Technical Confluences & Setup Confirmation (Click to toggle)
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {CONFLUENCES.map((conf) => {
              const isChecked = selectedConfluences.includes(conf.value);
              return (
                <Chip
                  key={conf.value}
                  label={conf.label}
                  size="small"
                  onClick={() => handleToggleConfluence(conf.value)}
                  variant={isChecked ? 'filled' : 'outlined'}
                  color={isChecked ? 'primary' : 'default'}
                  icon={isChecked ? <CheckCircleRounded sx={{ fontSize: 14 }} /> : undefined}
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

        {/* Emotions across trade stages */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
          <TextField
            select
            size="small"
            label="Emotion Before Entry"
            fullWidth
            value={watch('psychology.emotionBefore') || 'CALM'}
            onChange={(e) => setValue('psychology.emotionBefore', e.target.value)}
          >
            {EMOTIONS.map((em) => (
              <MenuItem key={em.value} value={em.value}>
                {em.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Emotion During Trade"
            fullWidth
            value={watch('psychology.emotionDuring') || 'CONFIDENT'}
            onChange={(e) => setValue('psychology.emotionDuring', e.target.value)}
          >
            {EMOTIONS.map((em) => (
              <MenuItem key={em.value} value={em.value}>
                {em.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Emotion After Exit"
            fullWidth
            value={watch('psychology.emotionAfter') || 'DISCIPLINED'}
            onChange={(e) => setValue('psychology.emotionAfter', e.target.value)}
          >
            {EMOTIONS.map((em) => (
              <MenuItem key={em.value} value={em.value}>
                {em.label}
              </MenuItem>
            ))}
          </TextField>
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

        {/* Behavioral Mistakes Chips */}
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
            Execution Mistakes & Behavioral Deviations
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {MISTAKE_TAGS.map((tag) => {
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
