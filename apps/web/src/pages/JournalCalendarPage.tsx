import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  FileText,
  TrendingUp,
  TrendingDown,
  X,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { formatCurrency } from '../lib/utils.js';

export function JournalCalendarPage() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-indexed

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
  }, [dayDetails]);

  const saveJournalMutation = useMutation({
    mutationFn: (review: any) => api.journal.saveDay(selectedDate!, review),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['journal-day', selectedDate] });
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
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  const days = calendarData?.days || [];

  // Monthly totals
  const totalMonthlyNet = days.reduce((sum: number, d: any) => sum + (d.netPnL || 0), 0);
  const totalMonthlyTrades = days.reduce((sum: number, d: any) => sum + (d.tradesCount || 0), 0);
  const winningDays = days.filter((d: any) => d.netPnL > 0).length;
  const losingDays = days.filter((d: any) => d.netPnL < 0).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Month Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Journal Calendar
          </h1>
          <p className="text-xs text-muted-foreground">
            Monthly P&L heat map, daily reflections, and post-session trade audits
          </p>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-border bg-card p-1 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-xs px-3 font-mono text-foreground">
              {monthNames[currentMonth - 1]} {currentYear}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl border border-border bg-card p-4 shadow-sm font-mono text-xs">
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Month Net P&L</span>
          <span className={`text-xl font-bold ${totalMonthlyNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(totalMonthlyNet)}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Trades Taken</span>
          <span className="text-xl font-semibold text-foreground">{totalMonthlyTrades}</span>
        </div>
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Green vs Red Days</span>
          <div className="text-xl font-semibold text-foreground flex items-center gap-2">
            <span className="text-emerald-400">{winningDays}W</span>
            <span className="text-rose-400">{losingDays}L</span>
          </div>
        </div>
        <div>
          <span className="text-[11px] font-sans text-muted-foreground block">Day Win Rate</span>
          <span className="text-xl font-semibold text-foreground">
            {winningDays + losingDays > 0
              ? `${Math.round((winningDays / (winningDays + losingDays)) * 100)}%`
              : '—'}
          </span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border bg-accent/20 text-center text-xs font-semibold text-muted-foreground py-2.5">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Calendar Day Cells */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border/60">
          {/* Empty cells before month start */}
          {Array.from({ length: firstDayWeekday }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[105px] bg-accent/5 p-2" />
          ))}

          {/* Month Days */}
          {days.map((dayItem: any) => {
            const hasTrades = dayItem.tradesCount > 0;
            const isGreen = dayItem.netPnL > 0;
            const isRed = dayItem.netPnL < 0;
            const isSelected = selectedDate === dayItem.date;

            return (
              <div
                key={dayItem.date}
                onClick={() => setSelectedDate(dayItem.date)}
                className={`min-h-[105px] p-2 flex flex-col justify-between cursor-pointer transition-all ${
                  isSelected ? 'ring-2 ring-emerald-500 bg-emerald-500/5' : 'hover:bg-accent/30'
                } ${
                  hasTrades && isGreen
                    ? 'bg-emerald-500/5'
                    : hasTrades && isRed
                    ? 'bg-rose-500/5'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className={`font-semibold ${hasTrades ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {dayItem.dayNumber}
                  </span>
                  {dayItem.hasJournal && (
                    <span className="flex h-2 w-2 rounded-full bg-blue-400" title="Daily Review Saved" />
                  )}
                </div>

                {hasTrades ? (
                  <div className="space-y-1">
                    <div
                      className={`text-xs font-mono font-bold ${
                        isGreen ? 'text-emerald-400' : isRed ? 'text-rose-400' : 'text-muted-foreground'
                      }`}
                    >
                      {formatCurrency(dayItem.netPnL)}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-sans flex items-center gap-1">
                      <span>{dayItem.tradesCount} trade{dayItem.tradesCount > 1 ? 's' : ''}</span>
                      <span>({dayItem.winCount}W/{dayItem.lossCount}L)</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground/40 font-mono">No trades</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Date Detail Drawer / Modal */}
      {selectedDate && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-xl space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CalendarIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Daily Review & Trades for {selectedDate}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Reflect on market execution and prepare for the next trading day
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedDate(null)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trades on this day */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Executions on this Day ({dayDetails?.trades?.length || 0})
              </h4>

              {isDayLoading ? (
                <div className="text-xs text-muted-foreground">Loading day trades...</div>
              ) : dayDetails?.trades?.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No trades recorded on {selectedDate}.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {dayDetails?.trades?.map((t: any) => (
                    <Link
                      key={t._id}
                      to={`/trades/${t._id}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-accent/40 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`font-mono font-bold ${
                            t.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.direction} {t.symbol}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{t.strategyName || 'Discretionary'}</span>
                      </div>
                      <span
                        className={`font-mono font-semibold ${
                          t.calculated?.netPnL > 0
                            ? 'text-emerald-400'
                            : t.calculated?.netPnL < 0
                            ? 'text-rose-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {formatCurrency(t.calculated?.netPnL)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Daily Review Form */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Daily Performance Reflection
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-muted-foreground mb-1">Market Bias</label>
                  <select
                    value={marketBias}
                    onChange={(e: any) => setMarketBias(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3"
                  >
                    <option value="BULLISH">BULLISH</option>
                    <option value="BEARISH">BEARISH</option>
                    <option value="NEUTRAL">NEUTRAL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-muted-foreground mb-1">Discipline Rating (1-5)</label>
                  <select
                    value={disciplineRating}
                    onChange={(e) => setDisciplineRating(Number(e.target.value))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 font-semibold"
                  >
                    <option value={5}>5 - Flawless Execution</option>
                    <option value={4}>4 - Good Execution</option>
                    <option value={3}>3 - Hesitant / Incomplete</option>
                    <option value={2}>2 - Rule Violation</option>
                    <option value={1}>1 - Completely Undisciplined</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Market Conditions</label>
                <input
                  type="text"
                  value={marketConditions}
                  onChange={(e) => setMarketConditions(e.target.value)}
                  placeholder="e.g. Trend day after gap up, heavy institutional volume"
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Lessons Learned</label>
                <textarea
                  value={lessonsLearned}
                  onChange={(e) => setLessonsLearned(e.target.value)}
                  rows={2}
                  placeholder="What went well today? What mistake must you avoid tomorrow?"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Plan for Next Session</label>
                <textarea
                  value={nextDayPlan}
                  onChange={(e) => setNextDayPlan(e.target.value)}
                  rows={2}
                  placeholder="Key levels to watch, specific playbook setups, and risk limits"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() =>
                    saveJournalMutation.mutate({
                      marketConditions,
                      marketBias,
                      emotionalState,
                      disciplineRating,
                      lessonsLearned,
                      nextDayPlan,
                    })
                  }
                  disabled={saveJournalMutation.isPending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md"
                >
                  {saveJournalMutation.isPending ? 'Saving Review...' : 'Save Daily Review'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
