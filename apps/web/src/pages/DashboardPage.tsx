import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext, Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Award,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
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
import { formatCurrency, formatPercent, formatR } from '../lib/utils.js';

export function DashboardPage() {
  const { selectedAccountId } = useOutletContext<{ selectedAccountId: string }>();
  const [dateRange, setDateRange] = useState<string>('ALL');

  // Compute startDate based on filter
  let startDate: string | undefined;
  const now = new Date();
  if (dateRange === '30D') {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate = d.toISOString().split('T')[0];
  } else if (dateRange === 'MONTH') {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (dateRange === 'WEEK') {
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDate = d.toISOString().split('T')[0];
  }

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', selectedAccountId, dateRange],
    queryFn: () =>
      api.dashboard.stats({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        startDate,
      }),
  });

  const { data: recentTradesData } = useQuery({
    queryKey: ['recent-trades', selectedAccountId],
    queryFn: () =>
      api.trades.list({
        accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
        limit: 5,
        sortBy: 'tradeDate',
        sortOrder: 'desc',
      }),
  });

  const recentTrades = recentTradesData?.data || [];

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
          <span className="text-xs text-muted-foreground font-mono">Loading performance metrics...</span>
        </div>
      </div>
    );
  }

  const isNetPositive = (stats?.netPnL || 0) >= 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Range Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Performance Overview
          </h1>
          <p className="text-xs text-muted-foreground">
            Discretionary execution analytics, equity curve, and discipline metrics
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center rounded-lg border border-border bg-card p-1 text-xs">
          {[
            { id: 'ALL', label: 'All Time' },
            { id: 'MONTH', label: 'This Month' },
            { id: '30D', label: 'Last 30 Days' },
            { id: 'WEEK', label: 'Last 7 Days' },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setDateRange(r.id)}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                dateRange === r.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Net P&L */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Net Realized P&L</span>
            {isNetPositive ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-500" />
            )}
          </div>
          <div className={`text-2xl font-bold font-mono ${isNetPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(stats?.netPnL)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
            <span>Gross: {formatCurrency(stats?.grossPnL)}</span>
            <span>Fees: {formatCurrency(stats?.totalCosts)}</span>
          </div>
        </div>

        {/* Card 2: Win Rate */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Win Rate & Outcome</span>
            <Percent className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {formatPercent(stats?.winRate)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
            <span className="text-emerald-400">{stats?.winningTradesCount || 0} Wins</span>
            <span className="text-rose-400">{stats?.losingTradesCount || 0} Losses</span>
            <span>{stats?.closedTradesCount || 0} Total</span>
          </div>
        </div>

        {/* Card 3: Profit Factor & Expectancy */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Profit Factor & Expectancy</span>
            <Award className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {stats?.profitFactor ? stats.profitFactor.toFixed(2) : '—'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
            <span>Expectancy: {formatCurrency(stats?.expectancy)}</span>
            <span>Avg R: {formatR(stats?.avgRealizedR)}</span>
          </div>
        </div>

        {/* Card 4: Drawdown & Discipline */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Max Drawdown & Discipline</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400">
            {stats?.maxDrawdownPercent ? `-${formatPercent(stats.maxDrawdownPercent)}` : '0.0%'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
            <span>Peak DD: {formatCurrency(stats?.maxDrawdownAmount)}</span>
            <span className="text-emerald-400">Rules: {formatPercent(stats?.ruleAdherencePercent)}</span>
          </div>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cumulative Equity Curve (2 Cols) */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Cumulative Equity Curve</h3>
              <p className="text-xs text-muted-foreground">Portfolio equity progression over time</p>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Peak: {formatCurrency(Math.max(...(stats?.equityCurve?.map((p: any) => p.cumulativeEquity) || [0])))}
            </span>
          </div>

          <div className="h-72 w-full">
            {stats?.equityCurve && stats.equityCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.equityCurve}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [formatCurrency(val), 'Equity']}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativeEquity"
                    stroke="#10B981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#equityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No closed trades yet to plot equity curve.
              </div>
            )}
          </div>
        </div>

        {/* Daily P&L Bars (1 Col) */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Daily Net P&L</h3>
              <p className="text-xs text-muted-foreground">Green winning / Red losing days</p>
            </div>
          </div>

          <div className="h-72 w-full">
            {stats?.dailyPnL && stats.dailyPnL.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailyPnL}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#1E293B',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [formatCurrency(val), 'Net P&L']}
                  />
                  <Bar dataKey="netPnL">
                    {stats.dailyPnL.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.netPnL >= 0 ? '#10B981' : '#EF4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No daily records found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Instrument */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3">Performance by Instrument</h3>
          <div className="space-y-3">
            {stats?.performanceByInstrument && stats.performanceByInstrument.length > 0 ? (
              stats.performanceByInstrument.map((inst: any) => (
                <div key={inst.symbol} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-foreground">{inst.symbol}</span>
                    <span className="text-[10px] text-muted-foreground font-sans">
                      ({inst.tradesCount} trades • {inst.winRate}% win)
                    </span>
                  </div>
                  <span
                    className={`font-mono font-semibold ${
                      inst.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatCurrency(inst.netPnL)}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No trades yet</span>
            )}
          </div>
        </div>

        {/* By Strategy */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3">Performance by Strategy</h3>
          <div className="space-y-3">
            {stats?.performanceByStrategy && stats.performanceByStrategy.length > 0 ? (
              stats.performanceByStrategy.map((strat: any) => (
                <div key={strat.strategyId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{strat.strategyName}</span>
                    <span className="text-[10px] text-muted-foreground font-sans">
                      ({strat.tradesCount} trades • {strat.winRate}% win)
                    </span>
                  </div>
                  <span
                    className={`font-mono font-semibold ${
                      strat.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatCurrency(strat.netPnL)}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No strategies linked yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Recent Trades Table */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recent Executions</h3>
            <p className="text-xs text-muted-foreground">Latest trades recorded in your journal</p>
          </div>
          <Link
            to="/trades"
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
          >
            View All Trades →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium">Direction</th>
                <th className="pb-2 font-medium">Setup</th>
                <th className="pb-2 font-medium text-right">Net P&L</th>
                <th className="pb-2 font-medium text-right">R-Multiple</th>
                <th className="pb-2 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {recentTrades.map((t: any) => (
                <tr key={t.id} className="hover:bg-accent/30 transition-colors">
                  <td className="py-2.5 font-mono text-muted-foreground">{t.tradeDate}</td>
                  <td className="py-2.5 font-bold font-mono text-foreground">
                    <Link to={`/trades/${t.id}`} className="hover:underline">
                      {t.symbol}
                    </Link>
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        t.direction === 'LONG'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {t.direction}
                    </span>
                  </td>
                  <td className="py-2.5 text-muted-foreground">{t.strategyName || 'Discretionary'}</td>
                  <td
                    className={`py-2.5 text-right font-mono font-semibold ${
                      t.calculated.netPnL > 0
                        ? 'text-emerald-400'
                        : t.calculated.netPnL < 0
                        ? 'text-rose-400'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {formatCurrency(t.calculated.netPnL)}
                  </td>
                  <td className="py-2.5 text-right font-mono">{formatR(t.calculated.realizedRMultiple)}</td>
                  <td className="py-2.5 text-center">
                    <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
