'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { staggerDelay } from '@/lib/utils';
import { buildDayTypes, todayIso } from '@/lib/calendar-day-types';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { ProjetBebeTabs } from '@/components/baby/ProjetBebeTabs';
import { FertilityCalendarLegend } from '@/components/baby/FertilityCalendarLegend';
import { FertilityCalendarInfo } from '@/components/baby/FertilityCalendarInfo';

interface CycleSummary {
  startDate: string;
  endDate: string | null;
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

export default function FertilityCalendarPage(): React.JSX.Element | null {
  const user = useUser();
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null);
  const [prediction, setPrediction] = useState<PredictionSummary | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [cyclesRes, predictionRes] = await Promise.all([
        api<{ cycles: CycleSummary[] }>('/api/cycles'),
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

  const dayTypes = useMemo(() => {
    if (!cycles) return {};
    return buildDayTypes(cycles, prediction, todayIso());
  }, [cycles, prediction]);

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

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-navy">
          <span className="text-3xl">📅</span>
          Calendrier de fertilité
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visualise ta fenêtre fertile et planifie ta conception.
        </p>
      </div>

      <ProjetBebeTabs active="calendrier" />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-5">
          {[now, next].map((monthDate, i) => (
            <div
              key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`}
              className="animate-fade-in-up rounded-lg border border-border bg-white p-5 lg:p-6"
              style={staggerDelay(i)}
            >
              <div className="mb-5 text-base font-semibold text-navy capitalize">
                {MONTH_LABELS[monthDate.getMonth()]} {monthDate.getFullYear()}
              </div>
              <MonthGrid
                year={monthDate.getFullYear()}
                month={monthDate.getMonth()}
                dayTypes={dayTypes}
                size="full"
              />
            </div>
          ))}
        </div>

        <div className="animate-fade-in-up flex flex-col gap-5" style={staggerDelay(2)}>
          <FertilityCalendarLegend />
          <FertilityCalendarInfo />
        </div>
      </div>

      <div className="mt-5">
        <Link href="/app/calendar" className="text-sm font-medium text-primary">
          Voir le calendrier complet (règles, prédictions) →
        </Link>
      </div>
    </div>
  );
}
