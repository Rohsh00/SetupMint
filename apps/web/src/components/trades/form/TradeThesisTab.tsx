import React, { useState } from 'react';
import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { CONFLUENCES, ConfluenceCategory } from '@tradevault/shared';

interface TradeThesisTabProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}

interface ConfluencePanelConfig {
  category: ConfluenceCategory;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

const CONFLUENCE_PANELS: ConfluencePanelConfig[] = [
  {
    category: 'LIQUIDITY',
    title: '1. Liquidity Sweeps & Resting Pools',
    subtitle: 'BSL / SSL sweeps, stop hunts, equal highs/lows, session raids',
    icon: (
      <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
      </svg>
    ),
  },
  {
    category: 'SUPPORT_RESISTANCE',
    title: '2. Support / Resistance & Key Levels',
    subtitle: 'HTF S/R, flip zones, supply & demand, range boundaries',
    icon: (
      <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18" />
      </svg>
    ),
  },
  {
    category: 'CONFIRMATION_STRUCTURE',
    title: '3. Confirmation & Market Structure',
    subtitle: 'CHOCH, BOS, displacement, fair value gaps, order blocks',
    icon: (
      <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
  },
  {
    category: 'INDICATORS_OTHER',
    title: '4. Indicators & Dynamic Levels',
    subtitle: 'VWAP, EMAs, Fib retracements, multi-timeframe alignment',
    icon: (
      <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

export function TradeThesisTab({ register, watch, setValue }: TradeThesisTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  // 1. Liquidity Sweeps expanded by default, others collapsed. Multi-accordion expansion allowed.
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    LIQUIDITY: true,
    SUPPORT_RESISTANCE: false,
    CONFIRMATION_STRUCTURE: false,
    INDICATORS_OTHER: false,
  });

  const selectedConfluences: string[] = watch('thesis.confluences') || [];

  const togglePanel = (category: string) => {
    setExpandedPanels((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleExpandAll = () => {
    setExpandedPanels({
      LIQUIDITY: true,
      SUPPORT_RESISTANCE: true,
      CONFIRMATION_STRUCTURE: true,
      INDICATORS_OTHER: true,
    });
  };

  const handleCollapseAll = () => {
    setExpandedPanels({
      LIQUIDITY: false,
      SUPPORT_RESISTANCE: false,
      CONFIRMATION_STRUCTURE: false,
      INDICATORS_OTHER: false,
    });
  };

  const handleClearAll = () => {
    setValue('thesis.confluences', []);
  };

  const handleToggleConfluence = (item: string) => {
    if (selectedConfluences.includes(item)) {
      setValue(
        'thesis.confluences',
        selectedConfluences.filter((c) => c !== item)
      );
    } else {
      setValue('thesis.confluences', [...selectedConfluences, item]);
    }
  };

  const allPanelsExpanded = Object.values(expandedPanels).every(Boolean);

  return (
    <div className="space-y-4">
      {/* Bias and Market Structure */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Pre-Market Bias
          </label>
          <select
            {...register('thesis.preMarketBias')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="BULLISH">BULLISH</option>
            <option value="BEARISH">BEARISH</option>
            <option value="NEUTRAL">NEUTRAL</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Market Structure
          </label>
          <select
            {...register('thesis.marketStructure')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="TRENDING_UP">TRENDING UP (Higher Highs / Higher Lows)</option>
            <option value="TRENDING_DOWN">TRENDING DOWN (Lower Highs / Lower Lows)</option>
            <option value="RANGING">RANGING / CONSOLIDATION</option>
            <option value="EXPANDING">EXPANDING RANGE</option>
          </select>
        </div>
      </div>

      {/* Technical Confluences & Setup Confirmation (Dynamic Accordion UI) */}
      <div className="space-y-3">
        {/* Top-Level Summary Bar */}
        <div
          className={`p-3 rounded-xl border transition-all ${
            selectedConfluences.length > 0
              ? 'bg-emerald-500/5 border-emerald-500/30'
              : 'bg-card/40 border-border/80'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Technical Confluences & Setup Confirmation
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold border transition-colors ${
                  selectedConfluences.length > 0
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                    : 'bg-muted/40 text-muted-foreground border-border'
                }`}
              >
                Total Confluences: {selectedConfluences.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Instant Search Filter */}
              <div className="relative flex-1 sm:flex-initial">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sweeps, levels, CHOCH..."
                  className="rounded-lg border border-border bg-background/80 px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full sm:w-56 pr-6"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1.5 text-xs text-muted-foreground hover:text-foreground"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Expand / Collapse All Toggle */}
              <button
                type="button"
                onClick={allPanelsExpanded ? handleCollapseAll : handleExpandAll}
                className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition-colors whitespace-nowrap"
              >
                {allPanelsExpanded ? 'Collapse All' : 'Expand All'}
              </button>

              {/* Clear All */}
              {selectedConfluences.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs font-semibold text-rose-400 hover:text-rose-300 px-2 py-1 rounded hover:bg-rose-500/10 transition-colors whitespace-nowrap"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Active Tags Removable Tray (Top-Level) */}
          {selectedConfluences.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-border/40 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                Active Selected ({selectedConfluences.length}):
              </span>
              {selectedConfluences.map((val) => {
                const confObj = CONFLUENCES.find((c) => c.value === val);
                const label = confObj?.label || val;
                return (
                  <span
                    key={val}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 group hover:border-emerald-500/60 transition-colors"
                  >
                    <span>{label}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleConfluence(val)}
                      className="text-emerald-400 hover:text-rose-400 rounded-full p-0.5 transition-colors"
                      title={`Remove ${label}`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Accordion Panels for 4 Categories */}
        <div className="space-y-2">
          {CONFLUENCE_PANELS.map((panel) => {
            const items = CONFLUENCES.filter(
              (c) =>
                c.category === panel.category &&
                (!searchQuery ||
                  c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  c.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase())))
            );

            // Auto-expand if active search matches confluences inside this panel
            const isSearching = Boolean(searchQuery.trim());
            const isExpanded = isSearching ? items.length > 0 : Boolean(expandedPanels[panel.category]);
            const groupSelectedCount = CONFLUENCES.filter(
              (c) => c.category === panel.category && selectedConfluences.includes(c.value)
            ).length;

            if (isSearching && items.length === 0) return null;

            return (
              <div
                key={panel.category}
                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                  isExpanded
                    ? 'border-border bg-card/60 shadow-xs'
                    : 'border-border/60 bg-card/30 hover:bg-card/50'
                }`}
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => togglePanel(panel.category)}
                  className="w-full flex items-center justify-between p-3 text-left transition-colors hover:bg-accent/30 select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg transition-colors ${
                        groupSelectedCount > 0
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      {panel.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-foreground truncate">
                        {panel.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate hidden sm:block">
                        {panel.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 ml-2">
                    {/* Dynamic count badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors border ${
                        groupSelectedCount > 0
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold'
                          : 'bg-muted/30 text-muted-foreground border-border/60 font-medium'
                      }`}
                    >
                      {groupSelectedCount > 0 ? `${groupSelectedCount} Selected` : '0 Selected'}
                    </span>

                    {/* Smooth Rotating Chevron Arrow */}
                    <svg
                      className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : 'rotate-0'
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Accordion Body */}
                {isExpanded && (
                  <div className="p-3 pt-1 border-t border-border/40 bg-background/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {items.map((conf) => {
                        const isChecked = selectedConfluences.includes(conf.value);
                        return (
                          <button
                            type="button"
                            key={conf.value}
                            onClick={() => handleToggleConfluence(conf.value)}
                            title={conf.description || conf.label}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${
                              isChecked
                                ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-300 font-semibold shadow-xs ring-1 ring-emerald-500/20 -translate-y-0.5'
                                : 'bg-card/70 border-border/70 text-muted-foreground hover:border-border hover:bg-accent/40 hover:text-foreground'
                            }`}
                          >
                            <div
                              className={`h-4 w-4 shrink-0 rounded flex items-center justify-center border text-[10px] font-black transition-colors ${
                                isChecked
                                  ? 'bg-emerald-600 border-emerald-500 text-white'
                                  : 'border-border/80 bg-background/50'
                              }`}
                            >
                              {isChecked && '✓'}
                            </div>
                            <span className="truncate">{conf.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Entry Rationale */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Entry Rationale & Setup Details
        </label>
        <textarea
          rows={3}
          {...register('thesis.entryRationale')}
          placeholder="Describe what confirmed the trade: liquidity sweep of previous day high, 5m fair value gap tap, break of structure on 1m chart..."
          className="w-full rounded-lg border border-border bg-card p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-muted-foreground"
        />
      </div>

      {/* Invalidation Conditions */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Invalidation Criteria
        </label>
        <input
          type="text"
          {...register('thesis.invalidationConditions')}
          placeholder="e.g. 5m candle close below 23,940 swing low"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
