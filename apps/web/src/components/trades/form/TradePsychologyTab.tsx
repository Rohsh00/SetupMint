import React from 'react';
import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { EMOTIONS, MISTAKE_TAGS } from '@tradevault/shared';

interface TradePsychologyTabProps {
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}

export function TradePsychologyTab({ register, watch, setValue }: TradePsychologyTabProps) {
  const disciplineScore = watch('psychology.disciplineScore') || 5;
  const selectedMistakes: string[] = watch('psychology.mistakes') || [];

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

  return (
    <div className="space-y-4">
      {/* Emotional state dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Emotion Before Entry
          </label>
          <select
            {...register('psychology.emotionBefore')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {EMOTIONS.map((em) => (
              <option key={em.value} value={em.value}>
                {em.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Emotion During Trade
          </label>
          <select
            {...register('psychology.emotionDuring')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {EMOTIONS.map((em) => (
              <option key={em.value} value={em.value}>
                {em.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Emotion After Exit
          </label>
          <select
            {...register('psychology.emotionAfter')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {EMOTIONS.map((em) => (
              <option key={em.value} value={em.value}>
                {em.label}
              </option>
            ))}
          </select>
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

      {/* Direct Mistake Tags */}
      <div className="pt-2 border-t border-border">
        <label className="block text-xs font-medium text-rose-400 mb-2 font-semibold">
          Costly Trading Mistakes Tracked
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {MISTAKE_TAGS.map((mistake) => {
            const isSelected = selectedMistakes.includes(mistake.value);
            return (
              <button
                type="button"
                key={mistake.value}
                onClick={() => handleToggleMistake(mistake.value)}
                className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${
                  isSelected
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 font-semibold'
                    : 'bg-card border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <div
                  className={`h-3.5 w-3.5 rounded flex items-center justify-center border ${
                    isSelected ? 'bg-rose-600 border-rose-500 text-white' : 'border-border'
                  }`}
                >
                  {isSelected && '✕'}
                </div>
                <span>{mistake.label}</span>
              </button>
            );
          })}
        </div>
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
