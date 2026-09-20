'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PeriodLogCtaProps {
  todayLogged: boolean;
  onLog: () => void;
  loading: boolean;
}

/**
 * "Mes règles sont terminées" is a pure UI acknowledgment, not a data
 * write — a period's end is already inferred automatically from the gap
 * in PeriodEvent dates (see groupIntoEpisodes), so there's nothing to
 * persist. This mirrors the existing precedent in PeriodTodayCard/
 * DailyLogForm, where selecting "Non" also results in no period-event API
 * call at all. Resets on next load, same as `todayLogged` itself.
 */
export function PeriodLogCta({
  todayLogged,
  onLog,
  loading,
}: PeriodLogCtaProps): React.JSX.Element {
  const [ended, setEnded] = useState(false);

  if (todayLogged) {
    return (
      <div className="animate-scale-in flex items-center gap-2 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-rose">
        <Check size={16} className="shrink-0" />
        Règles enregistrées aujourd&rsquo;hui
      </div>
    );
  }

  if (ended) {
    return (
      <div className="animate-scale-in flex items-center gap-2 rounded-xl bg-green-soft px-4 py-3 text-sm font-medium text-green">
        <Check size={16} className="shrink-0" />
        C&rsquo;est noté — à très vite pour ton prochain cycle !
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto xl:flex-row">
      <Button onClick={onLog} disabled={loading} className="min-h-12 w-full sm:w-auto">
        {loading ? 'Enregistrement…' : 'Mes règles ont commencé'}
      </Button>
      <button
        type="button"
        onClick={() => setEnded(true)}
        className="min-h-11 w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-navy transition-all duration-150 hover:bg-gray-50 active:scale-[0.97] sm:w-auto"
      >
        Mes règles sont terminées
      </button>
    </div>
  );
}
