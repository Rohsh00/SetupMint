import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import { useTheme as useMuiTheme } from '@mui/material/styles';

// Icons
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircleRounded';

import { api } from '../lib/api.js';
import { toast } from '../context/ToastContext.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { formatCurrency } from '../lib/utils.js';

export function JournalCalendarPage() {
  const queryClient = useQueryClient();
  const muiTheme = useMuiTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const ymString = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['journal-calendar', ymString],
    queryFn: () => api.journal.calendar(ymString),
  });

  const { data: dayDetails, isLoading: isDayLoading } = useQuery({
    queryKey: ['journal-day', selectedDate],
    queryFn: () => api.journal.getDay(selectedDate!),
    enabled: !!selectedDate,
  });

  // Daily review form state
  const [marketConditions, setMarketConditions] = useState('');
  const [marketBias, setMarketBias] = useState<'BULLISH' | 'BEARISH' | 'NEUTRAL'>('NEUTRAL');
  const [emotionalState, setEmotionalState] = useState('CALM');
  const [disciplineRating, setDisciplineRating] = useState(5);
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [nextDayPlan, setNextDayPlan] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load day details into review form when date changes
  React.useEffect(() => {
    if (dayDetails?.journal) {
      const j = dayDetails.journal;
      setMarketConditions(j.marketConditions || '');
      setMarketBias(j.marketBias || 'NEUTRAL');
      setEmotionalState(j.emotionalState || 'CALM');
      setDisciplineRating(j.disciplineRating || 5);
      setLessonsLearned(j.lessonsLearned || '');
      setNextDayPlan(j.nextDayPlan || '');
    } else {
      setMarketConditions('');
      setMarketBias('NEUTRAL');
      setEmotionalState('CALM');
      setDisciplineRating(5);
      setLessonsLearned('');
      setNextDayPlan('');
    }
    setSaveSuccess(false);
    setSaveError(null);
  }, [dayDetails]);

  const saveJournalMutation = useMutation({
    mutationFn: (review: any) => api.journal.saveDay(selectedDate!, review),
    onSuccess: () => {
      setSaveError(null);
      setSaveSuccess(true);
      toast.success('Journal entry saved successfully.');
      queryClient.invalidateQueries({ queryKey: ['journal-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['journal-day', selectedDate] });
      // Close the modal cleanly upon successful save
      setSelectedDate(null);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to save daily reflection';
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const deleteJournalMutation = useMutation({
    mutationFn: () => api.journal.deleteDay(selectedDate!),
    onSuccess: () => {
      setSaveError(null);
      setSaveSuccess(false);
      setIsDeleteConfirmOpen(false);
      toast.success('Journal entry deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['journal-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['journal-day', selectedDate] });
      setSelectedDate(null);
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to delete journal entry';
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Calculate first day weekday and total days in month
  const firstDayWeekday = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 is Sun
  const days = calendarData?.days || [];

  // Monthly totals
  const totalMonthlyNet = days.reduce((sum: number, d: any) => sum + (d.netPnL || 0), 0);
  const totalMonthlyTrades = days.reduce((sum: number, d: any) => sum + (d.tradesCount || 0), 0);
  const winningDays = days.filter((d: any) => d.netPnL > 0).length;
  const losingDays = days.filter((d: any) => d.netPnL < 0).length;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      {/* Header & Month Navigation */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          pb: 2,
          borderBottom: `1px solid ${muiTheme.palette.divider}`,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: muiTheme.palette.text.primary }}>
            Journal Calendar
          </Typography>
          <Typography variant="body2" sx={{ color: muiTheme.palette.text.secondary, mt: 0.5 }}>
            Monthly P&L heat map, daily reflections, and post-session trade audits
          </Typography>
        </Box>

        {/* Month Selector */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: muiTheme.palette.background.paper,
            borderRadius: 2,
            p: 0.5,
            border: `1px solid ${muiTheme.palette.divider}`,
          }}
        >
          <IconButton size="small" onClick={handlePrevMonth}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" sx={{ px: 2, fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
            {monthNames[currentMonth - 1]} {currentYear}
          </Typography>
          <IconButton size="small" onClick={handleNextMonth}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Monthly Summary Strip */}
      <Card sx={{ p: 2.5 }}>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Month Net P&L
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                fontFamily: `'JetBrains Mono', monospace`,
                color: totalMonthlyNet >= 0 ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                mt: 0.5,
              }}
            >
              {formatCurrency(totalMonthlyNet)}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Total Executions
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary, mt: 0.5 }}>
              {totalMonthlyTrades}
            </Typography>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Green vs Red Days
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: muiTheme.palette.profit.main, fontFamily: `'JetBrains Mono', monospace` }}>
                {winningDays}W
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: muiTheme.palette.loss.main, fontFamily: `'JetBrains Mono', monospace` }}>
                {losingDays}L
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Day Win Rate
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace`, color: muiTheme.palette.text.primary, mt: 0.5 }}>
              {winningDays + losingDays > 0
                ? `${Math.round((winningDays / (winningDays + losingDays)) * 100)}%`
                : '—'}
            </Typography>
          </Grid>
        </Grid>
      </Card>

      {/* Calendar Grid Card */}
      <Card sx={{ overflow: 'hidden' }}>
        {/* Weekday headers */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.7)' : 'rgba(248, 250, 252, 0.8)',
            py: 1.5,
            textAlign: 'center',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: muiTheme.palette.text.secondary,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </Box>

        {/* Day Cells Grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            '& > div': {
              borderRight: `1px solid ${muiTheme.palette.divider}`,
              borderBottom: `1px solid ${muiTheme.palette.divider}`,
              '&:nth-of-type(7n)': {
                borderRight: 'none',
              },
            },
          }}
        >
          {/* Pre-month Empty cells */}
          {Array.from({ length: firstDayWeekday }).map((_, i) => (
            <Box
              key={`empty-${i}`}
              sx={{
                minHeight: 110,
                p: 1.5,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.01)' : 'rgba(15, 23, 42, 0.01)',
              }}
            />
          ))}

          {/* Month Day Cells */}
          {days.map((dayItem: any) => {
            const hasTrades = dayItem.tradesCount > 0;
            const isGreen = dayItem.netPnL > 0;
            const isRed = dayItem.netPnL < 0;
            const isSelected = selectedDate === dayItem.date;

            return (
              <Box
                key={dayItem.date}
                onClick={() => setSelectedDate(dayItem.date)}
                sx={{
                  minHeight: 110,
                  p: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                  backgroundColor: isSelected
                    ? isDark
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'rgba(5, 150, 105, 0.12)'
                    : hasTrades && isGreen
                    ? muiTheme.palette.profit.bg
                    : hasTrades && isRed
                    ? muiTheme.palette.loss.bg
                    : 'transparent',
                  outline: isSelected ? `2px solid ${muiTheme.palette.primary.main}` : 'none',
                  outlineOffset: -2,
                  '&:hover': {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontFamily: `'JetBrains Mono', monospace`,
                      color: hasTrades ? muiTheme.palette.text.primary : muiTheme.palette.text.secondary,
                    }}
                  >
                    {dayItem.dayNumber}
                  </Typography>
                  {dayItem.hasJournal && (
                    <Tooltip title="Daily Reflection Saved" arrow>
                      <Box
                        sx={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          backgroundColor: '#3B82F6',
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>

                {hasTrades ? (
                  <Box sx={{ mt: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontFamily: `'JetBrains Mono', monospace`,
                        fontSize: '0.8125rem',
                        color: isGreen ? muiTheme.palette.profit.main : isRed ? muiTheme.palette.loss.main : muiTheme.palette.text.secondary,
                      }}
                    >
                      {formatCurrency(dayItem.netPnL)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary, fontSize: '0.6875rem', display: 'block', mt: 0.25 }}>
                      {dayItem.tradesCount} trades ({dayItem.winCount}W/{dayItem.lossCount}L)
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.disabled, fontSize: '0.6875rem' }}>
                    —
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </Card>

      {/* Daily Review & Day Details Dialog */}
      <Dialog
        open={Boolean(selectedDate)}
        onClose={() => setSelectedDate(null)}
        maxWidth="md"
        fullWidth
        scroll="paper"
        slotProps={{
          paper: { sx: { borderRadius: 3, maxHeight: '90vh' } },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            py: 2,
            borderBottom: `1px solid ${muiTheme.palette.divider}`,
            backgroundColor: isDark ? 'rgba(17, 24, 39, 0.7)' : 'rgba(248, 250, 252, 0.8)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CalendarMonthIcon sx={{ color: muiTheme.palette.primary.main }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
                Daily Review for {selectedDate}
              </Typography>
              <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                Post-session audit, trade outcomes, and discipline reflection
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setSelectedDate(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }}>
          {saveError && (
            <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setSaveError(null)}>
              {saveError}
            </Alert>
          )}
          <Grid container spacing={3}>
            {/* Left: Day Executions */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: muiTheme.palette.text.secondary, display: 'block', mb: 1.5 }}>
                Trades Executed ({dayDetails?.trades?.length || 0})
              </Typography>

              {isDayLoading ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : dayDetails?.trades?.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center', borderRadius: 2, border: `1px dashed ${muiTheme.palette.divider}` }}>
                  <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                    No trades executed on this date.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 380, overflowY: 'auto' }}>
                  {dayDetails?.trades?.map((t: any) => (
                    <Box
                      key={t._id}
                      component={RouterLink}
                      to={`/trades/${t._id}`}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${muiTheme.palette.divider}`,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)',
                        textDecoration: 'none',
                        color: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        '&:hover': {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.05)',
                        },
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: `'JetBrains Mono', monospace` }}>
                          <Box
                            component="span"
                            sx={{
                              color: t.direction === 'LONG' ? muiTheme.palette.profit.main : muiTheme.palette.loss.main,
                              mr: 0.75,
                            }}
                          >
                            {t.direction}
                          </Box>
                          {t.symbol}
                        </Typography>
                        <Typography variant="caption" sx={{ color: muiTheme.palette.text.secondary }}>
                          {t.strategyName || 'Discretionary'}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontFamily: `'JetBrains Mono', monospace`,
                          color: (t.calculated?.netPnL || 0) > 0 ? muiTheme.palette.profit.main : (t.calculated?.netPnL || 0) < 0 ? muiTheme.palette.loss.main : muiTheme.palette.text.secondary,
                        }}
                      >
                        {formatCurrency(t.calculated?.netPnL)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Grid>

            {/* Right: Daily Reflection Form */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: muiTheme.palette.text.secondary, display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <AutoAwesomeIcon fontSize="small" sx={{ color: muiTheme.palette.primary.main }} />
                Daily Session Reflection
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                      Market Bias
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={marketBias}
                        onChange={(e: any) => setMarketBias(e.target.value)}
                      >
                        <MenuItem value="BULLISH">BULLISH</MenuItem>
                        <MenuItem value="BEARISH">BEARISH</MenuItem>
                        <MenuItem value="NEUTRAL">NEUTRAL</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                      Discipline Rating (1-5)
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={disciplineRating}
                        onChange={(e) => setDisciplineRating(Number(e.target.value))}
                      >
                        <MenuItem value={5}>5 - Flawless Execution</MenuItem>
                        <MenuItem value={4}>4 - Good Execution</MenuItem>
                        <MenuItem value={3}>3 - Hesitant / Incomplete</MenuItem>
                        <MenuItem value={2}>2 - Rule Violation</MenuItem>
                        <MenuItem value={1}>1 - Severe Tilt / Loss</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                    Market Conditions & Context
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={marketConditions}
                    onChange={(e) => setMarketConditions(e.target.value)}
                    placeholder="e.g. Range-bound morning session, clean trend reversal post-noon"
                  />
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                    Lessons Learned & Psychological Feedback
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    size="small"
                    value={lessonsLearned}
                    onChange={(e) => setLessonsLearned(e.target.value)}
                    placeholder="What did the market do right? What emotional state did I experience?"
                  />
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: muiTheme.palette.text.secondary, display: 'block', mb: 0.5 }}>
                    Next Session Action Plan
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={nextDayPlan}
                    onChange={(e) => setNextDayPlan(e.target.value)}
                    placeholder="Key levels to monitor tomorrow, risk guardrails to enforce"
                  />
                </Box>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${muiTheme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {dayDetails?.journal && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                disabled={deleteJournalMutation.isPending || saveJournalMutation.isPending}
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                {deleteJournalMutation.isPending ? 'Deleting...' : 'Delete Entry'}
              </Button>
            )}
            {saveSuccess && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: muiTheme.palette.primary.main }}>
                <CheckCircleIcon fontSize="small" />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  Daily reflection saved successfully
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button variant="outlined" onClick={() => setSelectedDate(null)}>
              Close
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={saveJournalMutation.isPending}
              onClick={() => {
                saveJournalMutation.mutate({
                  marketConditions,
                  marketBias,
                  emotionalState,
                  disciplineRating,
                  lessonsLearned,
                  nextDayPlan,
                });
              }}
            >
              {saveJournalMutation.isPending ? 'Saving...' : 'Save Reflection'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Styled Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        title="Delete Daily Reflection"
        message={
          <>
            Are you sure you want to permanently delete the journal review and psychological reflection for <strong>{selectedDate}</strong>? This action cannot be undone.
          </>
        }
        confirmLabel="Delete Reflection"
        isLoading={deleteJournalMutation.isPending}
        error={saveError}
        onCancel={() => {
          if (!deleteJournalMutation.isPending) {
            setIsDeleteConfirmOpen(false);
          }
        }}
        onConfirm={() => {
          deleteJournalMutation.mutate();
        }}
      />
    </Box>
  );
}
