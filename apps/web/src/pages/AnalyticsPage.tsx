import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import {
  LineChart as LineChartIcon,
  Brain,
  Calendar,
  Layers,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api.js';
import { formatCurrency, formatPercent } from '../lib/utils.js';

export function AnalyticsPage() {
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>();
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'PSYCHOLOGY' | 'TIME'>('OVERVIEW');

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['dashboard-stats', selectedAccountId],
    queryFn: () =>
      api.dashboard.stats({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
      }),
  });

  const { data: psychologyData, isLoading: isPsychLoading } = useQuery({
    queryKey: ['analytics-psychology', selectedAccountId],
    queryFn: () =>
      api.analytics.psychology({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
      }),
  });

  if (isStatsLoading || isPsychLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
          <span className="text-xs text-muted-foreground font-mono">Analyzing trading performance...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Advanced Analytics
          </h1>
          <p className="text-xs text-muted-foreground">
            Quantitative edge analysis, drawdown tracking, and behavioral performance correlations
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-border bg-card p-1 text-xs">
          {[
            { id: 'OVERVIEW', label: 'Curve & Distribution', icon: LineChartIcon },
            { id: 'PSYCHOLOGY', label: 'Psychology & Discipline', icon: Brain },
            { id: 'TIME', label: 'Time & Session Breakdown', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW & DISTRIBUTION */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* Equity & Peak-to-Trough Drawdown Curve */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Peak-to-Trough Drawdown Curve</h3>
                <p className="text-xs text-muted-foreground">
                  Percentage drawdown from historical high equity mark
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded border border-rose-500/20">
                Max DD: -{formatPercent(stats?.maxDrawdownPercent)} ({formatCurrency(stats?.maxDrawdownAmount)})
              </span>
            </div>

            <div className="h-64 w-full">
              {stats?.equityCurve && stats.equityCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.equityCurve}>
                    <defs>
                      <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                    <XAxis dataKey="date" stroke="#64748B" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#64748B"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => `-${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#1E293B',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(val: any) => [`-${formatPercent(val)}`, 'Drawdown']}
                    />
                    <Area
                      type="monotone"
                      dataKey="drawdownPercent"
                      stroke="#EF4444"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#drawdownGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No trades to compute drawdown curve.
                </div>
              )}
            </div>
          </div>

          {/* P&L Distribution Histogram */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Trade P&L Distribution</h3>
              <p className="text-xs text-muted-foreground">Frequency of trade profits and losses by range</p>

              <div className="h-60 w-full">
                {stats?.pnlDistribution && stats.pnlDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.pnlDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                      <XAxis dataKey="range" stroke="#64748B" fontSize={9} tickLine={false} />
                      <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          borderColor: '#1E293B',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count">
                        {stats.pnlDistribution.map((entry: any, index: number) => (
                          <Cell
                            key={`pnl-cell-${index}`}
                            fill={entry.isProfit ? '#10B981' : '#EF4444'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No distribution data.
                  </div>
                )}
              </div>
            </div>

            {/* Streak & Ratio Summary Card */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Consistency & Streaks</h3>
              <p className="text-xs text-muted-foreground">Consecutive run metrics and trade outcome ratios</p>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono pt-2">
                <div className="rounded-lg border border-border bg-accent/20 p-3">
                  <span className="text-[10px] text-muted-foreground block font-sans">Current Streak</span>
                  <span
                    className={`text-xl font-bold ${
                      (stats?.currentStreak || 0) > 0
                        ? 'text-emerald-400'
                        : (stats?.currentStreak || 0) < 0
                        ? 'text-rose-400'
                        : 'text-foreground'
                    }`}
                  >
                    {stats?.currentStreak ? `${Math.abs(stats.currentStreak)} ${stats.currentStreak > 0 ? 'Wins' : 'Losses'}` : 'None'}
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-accent/20 p-3">
                  <span className="text-[10px] text-muted-foreground block font-sans">Max Win Streak</span>
                  <span className="text-xl font-bold text-emerald-400">
                    {stats?.maxConsecutiveWins || 0} Trades
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-accent/20 p-3">
                  <span className="text-[10px] text-muted-foreground block font-sans">Max Loss Streak</span>
                  <span className="text-xl font-bold text-rose-400">
                    {stats?.maxConsecutiveLosses || 0} Trades
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-accent/20 p-3">
                  <span className="text-[10px] text-muted-foreground block font-sans">Avg Winner / Loser</span>
                  <span className="text-xl font-bold text-foreground">
                    {stats?.avgLosingTrade ? (stats.avgWinningTrade / stats.avgLosingTrade).toFixed(2) : '—'}x
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-accent/10 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Descriptive statistics represent historical closed journal records and are independent of live broker execution.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PSYCHOLOGY & DISCIPLINE */}
      {activeTab === 'PSYCHOLOGY' && (
        <div className="space-y-6">
          {/* Discipline Score vs Win Rate Correlation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> Discipline Rating vs Performance
              </h3>
              <p className="text-xs text-muted-foreground">
                Correlation between execution discipline rating (1 to 5) and trading results
              </p>

              <div className="space-y-3 font-mono text-xs">
                {psychologyData?.performanceByDiscipline?.map((d: any) => (
                  <div key={d.score} className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="font-semibold text-foreground">Score {d.score}/5</span>
                    <span className="text-muted-foreground">{d.tradesCount} trades</span>
                    <span className="text-blue-400">{d.winRate}% Win</span>
                    <span className={d.netPnL >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {formatCurrency(d.netPnL)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance by Emotional State */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-400" /> Emotional State at Entry vs P&L
              </h3>
              <p className="text-xs text-muted-foreground">
                How emotional mindset at entry impacts your bottom-line profitability
              </p>

              <div className="space-y-3 font-mono text-xs">
                {psychologyData?.performanceByEmotion?.map((e: any) => (
                  <div key={e.emotion} className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="font-semibold text-foreground font-sans">{e.emotion}</span>
                    <span className="text-muted-foreground">{e.tradesCount} trades</span>
                    <span className="text-blue-400">{e.winRate}% Win</span>
                    <span className={e.netPnL >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {formatCurrency(e.netPnL)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cost of Trading Mistakes */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-foreground text-rose-400">
              The Real Cost of Discipline Mistakes
            </h3>
            <p className="text-xs text-muted-foreground">
              Direct monetary loss incurred from specific psychological violations
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {psychologyData?.mistakeAnalysis?.map((m: any) => (
                <div key={m.mistake} className="rounded-lg border border-border bg-background p-3 text-xs">
                  <span className="font-semibold block text-foreground truncate">{m.label}</span>
                  <span className="text-[11px] text-muted-foreground block mt-1">
                    Occurred: {m.occurrences} times
                  </span>
                  <span className="text-sm font-mono font-bold text-rose-400 block mt-2">
                    -{formatCurrency(m.totalLoss)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TIME & SESSION */}
      {activeTab === 'TIME' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Weekday Breakdown */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Performance by Day of Week</h3>
            <p className="text-xs text-muted-foreground">Identify which trading weekdays provide maximum edge</p>

            <div className="space-y-3 font-mono text-xs">
              {stats?.performanceByWeekday?.map((day: any) => (
                <div key={day.day} className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="font-semibold text-foreground font-sans">{day.day}</span>
                  <span className="text-muted-foreground">{day.tradesCount} trades</span>
                  <span className="text-blue-400">{day.winRate}% Win</span>
                  <span className={day.netPnL >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {formatCurrency(day.netPnL)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Session Breakdown */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Performance by Trading Session</h3>
            <p className="text-xs text-muted-foreground">
              NSE Regular market vs MCX Evening commodity session
            </p>

            <div className="space-y-3 font-mono text-xs">
              {stats?.performanceBySession && stats.performanceBySession.length > 0 ? (
                stats.performanceBySession.map((sess: any) => (
                  <div key={sess.session} className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="font-semibold text-foreground font-sans">{sess.session}</span>
                    <span className="text-muted-foreground">{sess.tradesCount} trades</span>
                    <span className="text-blue-400">{sess.winRate}% Win</span>
                    <span className={sess.netPnL >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {formatCurrency(sess.netPnL)}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No session records logged.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
