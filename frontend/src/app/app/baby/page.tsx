'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { todayIso } from '@/lib/calendar-day-types';
import { FertilityWindowCard } from '@/components/baby/FertilityWindowCard';
import { ConceptionStatsCard } from '@/components/baby/ConceptionStatsCard';
import { ConceptionTipsCard } from '@/components/baby/ConceptionTipsCard';
import { TodaySignalsCard, type TodaySignalsValues } from '@/components/baby/TodaySignalsCard';

interface CycleSummary {
  startDate: string;
  endDate: string | null;
  length: number | null;
  isOutlier: boolean;
}

interface PredictionSummary {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EMPTY_SIGNALS: TodaySignalsValues = {
  temperatureValue: null,
  temperatureUnit: null,
  cervicalMucusType: null,
  lhResult: null,
};

export default function BabyPage(): React.JSX.Element | null {
  const user = useUser();
  const { toast } = useToast();
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null);
  const [prediction, setPrediction] = useState<PredictionSummary | null>(null);
  const [signals, setSignals] = useState<TodaySignalsValues>(EMPTY_SIGNALS);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [cyclesRes, predictionRes, signalsRes] = await Promise.all([
        api<{ cycles: CycleSummary[] }>('/api/cycles'),
        api<{ prediction: PredictionSummary | null }>('/api/predictions/current'),
        api<{ signal: TodaySignalsValues | null }>('/api/fertility-signals/today'),
      ]);
      setCycles(cyclesRes.cycles);
      setPrediction(predictionRes.prediction);
      setSignals(signalsRes.signal ?? EMPTY_SIGNALS);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const handleSaveSignals = useCallback(
    (values: TodaySignalsValues) => {
      setSaving(true);
      void (async () => {
        try {
          await api('/api/fertility-signals/today', { method: 'PUT', body: values });
          setSignals(values);
          toast('Signaux enregistrés.', 'success');
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
    [toast],
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

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Projet Bébé</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suis ta fenêtre fertile et tes signaux de conception.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <FertilityWindowCard prediction={prediction} />
          <ConceptionTipsCard />
        </div>
        <div className="flex flex-col gap-5">
          <ConceptionStatsCard
            currentDay={currentDay}
            fertileWindowStart={prediction?.fertileWindowStart ?? null}
            fertileWindowEnd={prediction?.fertileWindowEnd ?? null}
            today={today}
          />
          <TodaySignalsCard initialValues={signals} saving={saving} onSubmit={handleSaveSignals} />
        </div>
      </div>
    </div>
  );
}
