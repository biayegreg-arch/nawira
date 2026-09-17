'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { onCycleDataChanged } from '@/lib/offline/queue';
import { staggerDelay } from '@/lib/utils';
import { buildDayTypes, todayIso } from '@/lib/calendar-day-types';
import { MonthGrid, type CalendarDayType } from '@/components/calendar/MonthGrid';
import { CalendarLegend } from '@/components/calendar/CalendarLegend';

interface CycleSummary {
  startDate: string;
  endDate: string | null;
  length: number | null;
  isOutlier: boolean;
}

interface PredictionSummary {
  expectedPeriodStart: string;
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
  ovulationEstimate: string | null;
}

const MONTH_LABELS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

export default function CalendarPage(): React.JSX.Element | null {
  const user = useUser();
  const router = useRouter();
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null);
  const [prediction, setPrediction] = useState<PredictionSummary | null>(null);
  const [error, setError] = useState(false);

  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const load = useCallback(async () => {
    setError(false);
    try {
      const [cyclesRes, predictionRes] = await Promise.all([
        api<{ cycles: CycleSummary[]; todayLogged: boolean }>('/api/cycles'),
        api<{ prediction: PredictionSummary | null }>('/api/predictions/current'),
      ]);
      setCycles(cyclesRes.cycles);
      setPrediction(predictionRes.prediction);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => onCycleDataChanged(() => void load()), [load]);

  const dayTypes = useMemo(() => {
    if (!cycles) return {};
    return buildDayTypes(cycles, prediction, todayIso());
  }, [cycles, prediction]);

  const goToPreviousMonth = (): void => {
    setView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 },
    );
  };

  const goToNextMonth = (): void => {
    setView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 },
    );
  };

  const handleDayClick = (iso: string, type: CalendarDayType | undefined): void => {
    if (type === 'today') router.push('/app/log');
  };

  if (!user) return null;

  if (error) {
    return (
      <div className="p-4 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger ton calendrier. Réessaie plus tard.
        </div>
      </div>
    );
  }

  if (cycles === null) {
    return (
      <div className="p-4 lg:p-8">
        <div className="h-96 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <h1 className="mb-1 text-2xl font-bold text-navy">Calendrier</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Visualise tes règles passées et tes prochaines prédictions.
      </p>

      <div className="animate-fade-in-up rounded-xl border border-border bg-white p-5 lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={goToPreviousMonth}
            aria-label="Mois précédent"
            className="flex h-12 w-12 items-center justify-center rounded-full text-navy transition-all duration-150 hover:bg-gray-50 active:scale-90"
          >
            <ChevronLeft size={20} />
          </button>
          <div
            key={`${view.year}-${view.month}`}
            className="animate-fade-in text-base font-semibold text-navy capitalize"
          >
            {MONTH_LABELS[view.month]} {view.year}
          </div>
          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="Mois suivant"
            className="flex h-12 w-12 items-center justify-center rounded-full text-navy transition-all duration-150 hover:bg-gray-50 active:scale-90"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="mb-6 border-b border-border pb-5">
          <CalendarLegend />
        </div>

        <div key={`grid-${view.year}-${view.month}`} className="animate-fade-in">
          <MonthGrid
            year={view.year}
            month={view.month}
            dayTypes={dayTypes}
            size="full"
            onDayClick={handleDayClick}
          />
        </div>
      </div>

      <div
        className="animate-fade-in-up mt-5 flex gap-3 rounded-xl bg-primary-soft p-4"
        style={staggerDelay(1)}
      >
        <Info size={18} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="text-sm text-body">
            Les prédictions s&rsquo;affinent au fil de tes cycles enregistrés. Plus tu suis tes
            règles régulièrement, plus les estimations deviennent fiables. Touche la date
            d&rsquo;aujourd&rsquo;hui pour ouvrir ton journal du jour.
          </p>
          <Link href="/app/cycles" className="mt-2 inline-block text-sm font-medium text-primary">
            Voir l&rsquo;historique de mes cycles →
          </Link>
        </div>
      </div>
    </div>
  );
}
