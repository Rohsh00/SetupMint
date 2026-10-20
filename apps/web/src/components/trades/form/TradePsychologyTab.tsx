import React, { useState } from 'react';
import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import {
  EMOTIONS,
  MISTAKE_TAGS,
  LIQUIDITY_RULE_CHECKLIST,
  MistakeCategory,
} from '@tradevault/shared';

interface TradePsychologyTabProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}

const MISTAKE_GROUPS: { category: MistakeCategory; title: string }[] = [
  { category: 'LIQUIDITY_LEVEL', title: '1. Liquidity & Structural Levels (S/R)' },
  { category: 'EXECUTION_TIMING', title: '2. Execution & Entry Timing' },
  { category: 'RISK_DISCIPLINE', title: '3. Risk Management & Discipline' },
  { category: 'SESSION_CONTEXT', title: '4. Session & Macro Context' },
];

export function TradePsychologyTab({ register, watch, setValue }: TradePsychologyTabProps) {
  const disciplineScore = watch('psychology.disciplineScore') || 5;
  const selectedMistakes: string[] = watch('psychology.mistakes') || [];
  const [checkedRules, setCheckedRules] = useState<number[]>([]);

  const handleToggleMistake = (tag: string) => {
    if (selectedMistakes.includes(tag)) {
      setValue(
        'psychology.mistakes',
        selectedMistakes.filter((m) => m !== tag)
      );
    } else {
      setValue('psychology.mistakes', [...selectedMistakes, tag]);
    }
  };

  const handleToggleRule = (index: number) => {
    let next: number[];
    if (checkedRules.includes(index)) {
      next = checkedRules.filter((i) => i !== index);
    } else {
      next = [...checkedRules, index];
    }
    setCheckedRules(next);
    if (next.length === LIQUIDITY_RULE_CHECKLIST.length) {
      setValue('psychology.rulesFollowed', true);
      setValue('psychology.checklistCompleted', true);
    }
  };

  const renderEmotionSelect = (fieldName: string) => (
    <select
      {...register(fieldName)}
      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
    >
      <optgroup label="Positive & Disciplined">
        {EMOTIONS.filter((e) => e.category === 'POSITIVE').map((em) => (
          <option key={em.value} value={em.value}>
            {em.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Neutral & Routine">
        {EMOTIONS.filter((e) => e.category === 'NEUTRAL').map((em) => (
          <option key={em.value} value={em.value}>
            {em.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Negative & Reactive">
        {EMOTIONS.filter((e) => e.category === 'NEGATIVE').map((em) => (
          <option key={em.value} value={em.value}>
            {em.label}
          </option>
        ))}
      </optgroup>
    </select>
  );

  return (
    <div className="space-y-4">
      {/* Emotional state dropdowns (Grouped Positive/Neutral/Negative) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Emotion Before Entry
          </label>
          {renderEmotionSelect('psychology.emotionBefore')}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Emotion During Trade
          </label>
          {renderEmotionSelect('psychology.emotionDuring')}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Emotion After Exit
          </label>
          {renderEmotionSelect('psychology.emotionAfter')}
        </div>
      </div>

      {/* Discipline Score Selector (1-5) */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          Discipline Rating (1 to 5)
        </label>
        <div className="flex items-center gap-3">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              type="button"
              key={score}
              onClick={() => setValue('psychology.disciplineScore', score)}
              className={`h-9 w-12 rounded-lg border font-bold text-sm font-mono transition-all ${
                disciplineScore === score
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {score}
            </button>
          ))}
          <span className="text-xs text-muted-foreground font-medium ml-2">
            {disciplineScore === 5
              ? 'Flawless execution according to plan'
              : disciplineScore === 1
              ? 'Complete deviation / impulsive trade'
              : 'Acceptable execution with minor slips'}
          </span>
        </div>
      </div>

      {/* Liquidity Rules Checklist & Rules Followed Indicator */}
      <div className="p-3 rounded-lg border border-border bg-card/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Liquidity & Structure Rules Checklist
            </span>
          </div>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              checkedRules.length === LIQUIDITY_RULE_CHECKLIST.length
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : checkedRules.length >= 7
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            Rules Followed: {checkedRules.length} / {LIQUIDITY_RULE_CHECKLIST.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {LIQUIDITY_RULE_CHECKLIST.map((rule, idx) => {
            const isChecked = checkedRules.includes(idx);
            return (
              <label
                key={idx}
                onClick={() => handleToggleRule(idx)}
                className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-all ${
                  isChecked
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-medium'
                    : 'bg-card border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  className="mt-0.5 rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                <span className="leading-tight">{rule}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Rules and Checklist toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
          <input
            type="checkbox"
            {...register('psychology.rulesFollowed')}
            className="rounded border-border text-emerald-600 focus:ring-emerald-500"
          />
          <span>Trading Rules Strictly Followed</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
          <input
            type="checkbox"
            {...register('psychology.checklistCompleted')}
            className="rounded border-border text-emerald-600 focus:ring-emerald-500"
          />
          <span>Pre-Trade Checklist Completed</span>
        </label>
      </div>

      {/* Direct Mistake Tags Grouped by Category */}
      <div className="pt-2 border-t border-border space-y-3">
        <label className="block text-xs font-medium text-rose-400 font-semibold">
          Costly Trading Mistakes Tracked ({selectedMistakes.length} tagged)
        </label>

        {MISTAKE_GROUPS.map((group) => {
          const items = MISTAKE_TAGS.filter((m) => m.category === group.category);
          if (items.length === 0) return null;

          return (
            <div key={group.category} className="space-y-1.5 p-2 rounded-lg border border-border/60 bg-muted/20">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                {group.title}
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {items.map((mistake) => {
                  const isSelected = selectedMistakes.includes(mistake.value);
                  return (
                    <button
                      type="button"
                      key={mistake.value}
                      onClick={() => handleToggleMistake(mistake.value)}
                      title={mistake.description}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${
                        isSelected
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 font-semibold'
                          : 'bg-card border-border text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <div
                        className={`h-3.5 w-3.5 shrink-0 rounded flex items-center justify-center border ${
                          isSelected ? 'bg-rose-600 border-rose-500 text-white' : 'border-border'
                        }`}
                      >
                        {isSelected && '✕'}
                      </div>
                      <span className="truncate">{mistake.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes & Lessons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Lessons Learned
          </label>
          <textarea
            rows={3}
            {...register('psychology.lessonsLearned')}
            placeholder="Key takeaway: Waited patiently for 5m candle close instead of jumping early..."
            className="w-full rounded-lg border border-border bg-card p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            General Trade Notes
          </label>
          <textarea
            rows={3}
            {...register('psychology.notes')}
            placeholder="Additional context, market news, or session notes..."
            className="w-full rounded-lg border border-border bg-card p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}
