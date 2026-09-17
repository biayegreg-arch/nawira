'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { onCycleDataChanged, runOrQueue } from '@/lib/offline/queue';
import { staggerDelay } from '@/lib/utils';
import { todayIso } from '@/lib/calendar-day-types';
import { FertilityWindowCard } from '@/components/baby/FertilityWindowCard';
import { ConceptionStatsCard } from '@/components/baby/ConceptionStatsCard';
import { OtherSignalsCard, type OtherSignalsValues } from '@/components/baby/OtherSignalsCard';
import { LHTestTracker, type RecentLhEntry } from '@/components/baby/LHTestTracker';
import { ProjetBebeTabs } from '@/components/baby/ProjetBebeTabs';

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
  ovulationEstimate: string | null;
}

interface TodaySignals {
  temperatureValue: number | null;
  temperatureUnit: 'CELSIUS' | 'FAHRENHEIT' | null;
  cervicalMucusType: string | null;
  lhResult: string | null;
}

interface ProfileStats {
  monthsActive: number;
  daysTracked: number;
  cyclesCompleted: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EMPTY_SIGNALS: TodaySignals = {
  temperatureValue: null,
  temperatureUnit: null,
  cervicalMucusType: null,
  lhResult: null,
};

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY);
}

export default function BabyPage(): React.JSX.Element | null {
  const user = useUser();
  const { toast } = useToast();
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null);
  const [prediction, setPrediction] = useState<PredictionSummary | null>(null);
  const [signals, setSignals] = useState<TodaySignals>(EMPTY_SIGNALS);
  const [recentLhEntries, setRecentLhEntries] = useState<RecentLhEntry[]>([]);
  const [profileCreatedAt, setProfileCreatedAt] = useState<string | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [error, setError] = useState(false);
  const [savingOther, setSavingOther] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [cyclesRes, predictionRes, signalsRes, recentRes, profileRes] = await Promise.all([
        api<{ cycles: CycleSummary[] }>('/api/cycles'),
        api<{ prediction: PredictionSummary | null }>('/api/predictions/current'),
        api<{ signal: TodaySignals | null }>('/api/fertility-signals/today'),
        api<{ entries: RecentLhEntry[] }>('/api/fertility-signals/recent'),
        api<{
          profile: { createdAt: string };
          stats: ProfileStats;
        }>('/api/profile'),
      ]);
      setCycles(cyclesRes.cycles);
      setPrediction(predictionRes.prediction);
      setSignals(signalsRes.signal ?? EMPTY_SIGNALS);
      setRecentLhEntries(recentRes.entries);
      setProfileCreatedAt(profileRes.profile.createdAt);
      setProfileStats(profileRes.stats);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => onCycleDataChanged(() => void load()), [load]);

  const handleSaveOther = useCallback(
    (values: OtherSignalsValues) => {
      setSavingOther(true);
      void (async () => {
        try {
          const merged: TodaySignals = { ...values, lhResult: signals.lhResult };
          const result = await runOrQueue(
            `fertility-signal:${todayIso()}`,
            '/api/fertility-signals/today',
            'PUT',
            merged,
          );
          setSignals(merged);
          toast(
            result.queued
              ? 'Hors ligne — sera synchronisé automatiquement.'
              : 'Signaux enregistrés.',
            result.queued ? 'info' : 'success',
          );
        } catch (err) {
          toast(
            err instanceof ApiError ? err.message : 'Impossible d’enregistrer. Réessaie.',
            'error',
          );
        } finally {
          setSavingOther(false);
        }
      })();
    },
    [toast, signals.lhResult],
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

  if (cycles === null || profileStats === null || profileCreatedAt === null) {
    return (
      <div className="p-4 lg:p-8">
        <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const today = todayIso();
  const totalDaysSinceActivation = Math.max(
    1,
    daysBetween(profileCreatedAt.slice(0, 10), today) + 1,
  );

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-navy">
          <span className="text-3xl">🌿</span>
          Projet Bébé
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accompagne ton désir de conception avec NAWIRA.
        </p>
      </div>

      <ProjetBebeTabs active="apercu" />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="animate-fade-in-up flex flex-col gap-5" style={staggerDelay(1)}>
          <FertilityWindowCard prediction={prediction} today={today} />
          <OtherSignalsCard
            initialValues={{
              temperatureValue: signals.temperatureValue,
              temperatureUnit: signals.temperatureUnit,
              cervicalMucusType: signals.cervicalMucusType,
            }}
            saving={savingOther}
            onSubmit={handleSaveOther}
          />
        </div>
        <div className="animate-fade-in-up flex flex-col gap-5" style={staggerDelay(2)}>
          <LHTestTracker todayResult={signals.lhResult} recentEntries={recentLhEntries} />
          <ConceptionStatsCard
            monthsActive={profileStats.monthsActive}
            cyclesCompleted={profileStats.cyclesCompleted}
            daysTracked={profileStats.daysTracked}
            totalDaysSinceActivation={totalDaysSinceActivation}
            cycles={cycles}
          />
        </div>
      </div>

      <div
        className="animate-fade-in-up mt-6 rounded-lg border border-border bg-green-soft/40 p-6"
        style={staggerDelay(3)}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-navy">
              <span>👑</span>
              Déverrouille Projet Bébé complet
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Accède à des outils avancés : suivi des tests, calendrier de fertilité détaillé,
              conseils IA spécifiques et bien plus. Disponible avec NAWIRA Plus.
            </p>
            <Link
              href="/app/billing"
              className="inline-flex items-center justify-center rounded-md bg-green px-4 py-2 text-sm font-semibold text-white"
            >
              Essayer gratuitement
            </Link>
          </div>
          <span className="shrink-0 text-4xl">🎁</span>
        </div>
      </div>
    </div>
  );
}
