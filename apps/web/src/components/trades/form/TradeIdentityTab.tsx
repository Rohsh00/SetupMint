import React from 'react';
import { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import {
  ASSET_CLASSES,
  MARKET_SEGMENTS,
  TRADING_SESSIONS,
} from '@tradevault/shared';

interface TradeIdentityTabProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
  accounts: any[];
  instruments: any[];
  strategies: any[];
}

export function TradeIdentityTab({
  register,
  watch,
  setValue,
  accounts,
  instruments,
  strategies,
}: TradeIdentityTabProps) {
  const selectedSymbol = watch('symbol');
  const selectedAssetClass = watch('assetClass');
  const direction = watch('direction');

  // When instrument is picked, auto-populate details
  const handleInstrumentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sym = e.target.value;
    setValue('symbol', sym);

    const found = instruments.find((i) => i.symbol === sym);
    if (found) {
      setValue('assetClass', found.assetClass);
      setValue('exchange', found.exchange);
      setValue('marketSegment', found.marketSegment);
      setValue('simpleExecution.contractMultiplier', found.contractMultiplier || 1);
      setValue('risk.lotSize', found.lotSize || 1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Trading Account */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Trading Account <span className="text-rose-500">*</span>
          </label>
          <select
            {...register('accountId', { required: true })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.broker} · {acc.baseCurrency})
              </option>
            ))}
          </select>
        </div>

        {/* Instrument Symbol */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Instrument Preset
          </label>
          <select
            value={selectedSymbol}
            onChange={handleInstrumentChange}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
          >
            {instruments.map((inst) => (
              <option key={inst.symbol} value={inst.symbol}>
                {inst.symbol} - {inst.displayName || inst.assetClass} ({inst.exchange})
              </option>
            ))}
          </select>
        </div>

        {/* Manual Symbol input */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Symbol Ticker <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            {...register('symbol', { required: true })}
            placeholder="e.g. NIFTY, RELIANCE, CRUDEOIL"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono uppercase text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Asset Class */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Asset Class
          </label>
          <select
            {...register('assetClass')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {ASSET_CLASSES.map((ac) => (
              <option key={ac.value} value={ac.value}>
                {ac.label}
              </option>
            ))}
          </select>
        </div>

        {/* Exchange */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Exchange
          </label>
          <input
            type="text"
            {...register('exchange')}
            placeholder="NSE, BSE, MCX, FOREX, BINANCE"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono uppercase text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Market Segment */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Market Segment
          </label>
          <select
            {...register('marketSegment')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {MARKET_SEGMENTS.map((seg) => (
              <option key={seg.value} value={seg.value}>
                {seg.label}
              </option>
            ))}
          </select>
        </div>

        {/* Direction Switcher */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Direction <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setValue('direction', 'LONG')}
              className={`py-2 px-3 rounded-lg border text-xs font-bold font-mono transition-all ${
                direction === 'LONG'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              LONG (BUY)
            </button>
            <button
              type="button"
              onClick={() => setValue('direction', 'SHORT')}
              className={`py-2 px-3 rounded-lg border text-xs font-bold font-mono transition-all ${
                direction === 'SHORT'
                  ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              SHORT (SELL)
            </button>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Trade Status <span className="text-rose-500">*</span>
          </label>
          <select
            {...register('status')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="CLOSED">CLOSED (Completed Trade)</option>
            <option value="OPEN">OPEN (Currently Running)</option>
            <option value="PLANNED">PLANNED (Order Setup)</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {/* Strategy */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Strategy Playbook Setup
          </label>
          <select
            {...register('strategyId')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">No Strategy (Discretionary)</option>
            {strategies.map((strat) => (
              <option key={strat.id} value={strat.id}>
                {strat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Date, Time, Session */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-border">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Trade Date <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            {...register('tradeDate', { required: true })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Entry Timestamp <span className="text-rose-500">*</span>
          </label>
          <input
            type="datetime-local"
            {...register('entryTime', { required: true })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Exit Timestamp
          </label>
          <input
            type="datetime-local"
            {...register('exitTime')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Trading Session
          </label>
          <select
            {...register('session')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {TRADING_SESSIONS.map((sess) => (
              <option key={sess.value} value={sess.value}>
                {sess.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Trade Title & Tags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Trade Title / Setup Reference
          </label>
          <input
            type="text"
            {...register('tradeTitle')}
            placeholder="e.g. Morning Opening Drive FVG Long"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            {...register('tagsInput')}
            placeholder="e.g. INTRADAY, BREAKOUT, A-PLUS"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono uppercase text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}
