'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { todayIso } from '@/lib/calendar-day-types';
import {
  DailyLogForm,
  type DailyLogInitialValues,
  type DailyLogSubmitValues,
} from '@/components/log/DailyLogForm';
import { CycleContextCard, derivePhase } from '@/components/log/CycleContextCard';
import { PhaseTipCard } from '@/components/log/PhaseTipCard';
import { RecentEntriesCard, type RecentEntry } from '@/components/log/RecentEntriesCard';
import { PeriodRangeForm, type PeriodRangeSubmitValues } from '@/components/log/PeriodRangeForm';

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

interface FertilitySignals {
  temperatureValue: number | null;
  temperatureUnit: 'CELSIUS' | 'FAHRENHEIT' | null;
  cervicalMucusType: string | null;
  lhResult: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function LogPage(): React.JSX.Element | null {
  const user = useUser();
  const { toast } = useToast();
  const [initialValues, setInitialValues] = useState<DailyLogInitialValues | null>(null);
  const [todayFlowLogged, setTodayFlowLogged] = useState(false);
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  const [prediction, setPrediction] = useState<PredictionSummary | null>(null);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [existingSignals, setExistingSignals] = useState<FertilitySignals | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [logRes, cyclesRes, predictionRes, recentRes, signalsRes] = await Promise.all([
        api<{ log: Omit<DailyLogInitialValues, 'temperatureValue' | 'temperatureUnit'> | null }>(
          '/api/daily-logs/today',
        ),
        api<{ cycles: CycleSummary[]; todayLogged: boolean }>('/api/cycles'),
        api<{ prediction: PredictionSummary | null }>('/api/predictions/current'),
        api<{ entries: RecentEntry[] }>('/api/daily-logs/recent'),
        api<{ signal: FertilitySignals | null }>('/api/fertility-signals/today'),
      ]);
      const signal = signalsRes.signal;
      setInitialValues({
        ...(logRes.log ?? {
          painLevel: null,
          painLocation: null,
          mood: null,
          energy: null,
          sleepQuality: null,
          sleepHours: null,
          note: null,
          symptoms: [],
        }),
        temperatureValue: signal?.temperatureValue ?? null,
        temperatureUnit: signal?.temperatureUnit ?? null,
      });
      setTodayFlowLogged(cyclesRes.todayLogged);
      setCycles(cyclesRes.cycles);
      setPrediction(predictionRes.prediction);
      setRecentEntries(recentRes.entries);
      setExistingSignals(
        signal ?? {
          temperatureValue: null,
          temperatureUnit: null,
          cervicalMucusType: null,
          lhResult: null,
        },
      );
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const handleSubmit = useCallback(
    (values: DailyLogSubmitValues) => {
      setSaving(true);
      void (async () => {
        try {
          const { flow, temperatureValue, temperatureUnit, ...logValues } = values;
          await api('/api/daily-logs/today', { method: 'PUT', body: logValues });
          if (flow !== 'NONE') {
            await api('/api/period-events', { method: 'POST', body: { flow } });
          }
          await api('/api/fertility-signals/today', {
            method: 'PUT',
            body: {
              temperatureValue,
              temperatureUnit,
              cervicalMucusType: existingSignals?.cervicalMucusType ?? null,
              lhResult: existingSignals?.lhResult ?? null,
            },
          });
          toast('Données enregistrées.', 'success');
          await load();
        } catch (err) {
          toast(
            err instanceof ApiError ? err.message : 'Impossible d’enregistrer. Réessaie.',
            'error',
          );
        } finally {
          setSaving(false);
        }
      })();
    },
    [existingSignals, load, toast],
  );

  const handlePeriodRangeSubmit = useCallback(
    async (values: PeriodRangeSubmitValues) => {
      try {
        const res = await api<{ ok: true; daysLogged: number }>('/api/period-events', {
          method: 'POST',
          body: values,
        });
        toast(
          `${res.daysLogged} jour${res.daysLogged > 1 ? 's' : ''} de règles ajouté${res.daysLogged > 1 ? 's' : ''}.`,
          'success',
        );
        await load();
      } catch (err) {
        toast(
          err instanceof ApiError
            ? err.message
            : 'Impossible d’enregistrer cette période. Réessaie.',
          'error',
        );
        throw err;
      }
    },
    [load, toast],
  );

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

  if (initialValues === null) {
    return (
      <div className="p-4 lg:p-8">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
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
  const phase = derivePhase(todayFlowLogged, prediction, today);

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-navy">Ajouter des données</h1>
          <p className="text-sm text-muted-foreground">
            Aujourd&rsquo;hui{currentDay !== null ? ` — Jour ${currentDay} de ton cycle` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6 lg:max-w-2xl">
          <DailyLogForm
            initialValues={initialValues}
            todayFlowLogged={todayFlowLogged}
            saving={saving}
            onSubmit={handleSubmit}
          />
          <PeriodRangeForm onSubmit={handlePeriodRangeSubmit} />
        </div>

        <div className="flex flex-col gap-5 lg:w-72 lg:shrink-0">
          <CycleContextCard
            currentDay={currentDay}
            cycleLength={mostRecent?.length ?? null}
            todayLogged={todayFlowLogged}
            prediction={prediction}
            today={today}
          />
          <PhaseTipCard phase={phase} />
          <RecentEntriesCard entries={recentEntries} />
        </div>
      </div>
    </div>
  );
}
