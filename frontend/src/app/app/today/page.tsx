'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { greetingName } from '@/lib/utils';
import { buildDayTypes, todayIso } from '@/lib/calendar-day-types';
import { CycleRing } from '@/components/today/CycleRing';
import { PeriodLogCta } from '@/components/today/PeriodLogCta';
import { PredictionCard } from '@/components/today/PredictionCard';
import { MiniCalendar } from '@/components/today/MiniCalendar';

interface CycleSummary {
  startDate: string;
  endDate: string | null;
  length: number | null;
  isOutlier: boolean;
}

interface PredictionSummary {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedPeriodStart: string;
  expectedPeriodEnd: string;
  algorithmVersion: string;
  computedAt: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function TodayPage(): React.JSX.Element | null {
  const user = useUser();
  const { toast } = useToast();
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null);
  const [todayLogged, setTodayLogged] = useState(false);
  const [prediction, setPrediction] = useState<PredictionSummary | null>(null);
  const [error, setError] = useState(false);
  const [logging, setLogging] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [cyclesRes, predictionRes] = await Promise.all([
        api<{ cycles: CycleSummary[]; todayLogged: boolean }>('/api/cycles'),
        api<{ prediction: PredictionSummary | null }>('/api/predictions/current'),
      ]);
      setCycles(cyclesRes.cycles);
      setTodayLogged(cyclesRes.todayLogged);
      setPrediction(predictionRes.prediction);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const handleLog = useCallback(() => {
    setLogging(true);
    void (async () => {
      try {
        await api('/api/period-events', { method: 'POST', body: {} });
        await load();
      } catch (err) {
        toast(
          err instanceof ApiError ? err.message : 'Impossible d’enregistrer. Réessaie.',
          'error',
        );
      } finally {
        setLogging(false);
      }
    })();
  }, [load, toast]);

  if (!user) return null;

  if (error) {
    return (
      <div className="p-4 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger tes données. Réessaie plus tard.
        </div>
      </div>
    );
  }

  if (cycles === null) {
    return (
      <div className="p-4 lg:p-8">
        <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const mostRecent = cycles[0] ?? null;
  const today = todayIso();
  const currentDay = mostRecent
    ? Math.round(
        (new Date(today).getTime() - new Date(mostRecent.startDate).getTime()) / MS_PER_DAY,
      ) + 1
    : null;
  const estimatedLength =
    prediction && mostRecent
      ? Math.round(
          (new Date(prediction.expectedPeriodStart).getTime() -
            new Date(mostRecent.startDate).getTime()) /
            MS_PER_DAY,
        )
      : null;
  const dayTypes = buildDayTypes(cycles, prediction, today);

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 rounded-xl bg-gradient-to-br from-primary-soft to-rose-soft p-6">
        <h1 className="mb-1 text-2xl font-bold text-navy">Bonjour {greetingName(user.email)} 👋</h1>
        <p className="text-sm text-body">
          Aujourd&rsquo;hui est une belle journée pour prendre soin de toi.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-white p-6 sm:flex-row sm:items-start">
            <CycleRing currentDay={currentDay} estimatedLength={estimatedLength} />
            <div className="flex w-full flex-1 flex-col items-center gap-3 sm:items-start">
              <PeriodLogCta todayLogged={todayLogged} onLog={handleLog} loading={logging} />
            </div>
          </div>
          <PredictionCard prediction={prediction} />
        </div>
        <MiniCalendar dayTypes={dayTypes} />
      </div>
    </div>
  );
}
