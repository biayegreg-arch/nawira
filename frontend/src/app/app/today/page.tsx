'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ApiError } from '@/lib/api';
import { onCycleDataChanged, runOrQueue } from '@/lib/offline/queue';
import { fetchCached } from '@/lib/offline/read-cache';
import { track } from '@/lib/analytics';
import { greetingName, staggerDelay } from '@/lib/utils';
import { buildDayTypes, todayIso } from '@/lib/calendar-day-types';
import { OfflineDataBanner } from '@/components/app/OfflineDataBanner';
import { CycleRing } from '@/components/today/CycleRing';
import { PeriodLogCta } from '@/components/today/PeriodLogCta';
import { PredictionCards } from '@/components/today/PredictionCards';
import { MiniCalendar } from '@/components/today/MiniCalendar';
import { MoodSelector } from '@/components/today/MoodSelector';
import { DailyTip } from '@/components/today/DailyTip';
import { ProjetBebeCard } from '@/components/today/ProjetBebeCard';

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
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
  ovulationEstimate: string | null;
}

interface DailyLogState {
  painLevel: number | null;
  painLocation: string | null;
  mood: string | null;
  energy: string | null;
  sleepQuality: string | null;
  sleepHours: number | null;
  note: string | null;
  symptoms: string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY);
}

export default function TodayPage(): React.JSX.Element | null {
  const user = useUser();
  const { toast } = useToast();
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null);
  const [todayLogged, setTodayLogged] = useState(false);
  const [prediction, setPrediction] = useState<PredictionSummary | null>(null);
  const [todayLog, setTodayLog] = useState<DailyLogState | null>(null);
  const [error, setError] = useState(false);
  const [logging, setLogging] = useState(false);
  const [savingMood, setSavingMood] = useState(false);
  const [offlineCachedAt, setOfflineCachedAt] = useState<string | null>(null);
  const predictionViewedTracked = useRef(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [cyclesRes, predictionRes, logRes] = await Promise.all([
        fetchCached<{ cycles: CycleSummary[]; todayLogged: boolean }>('/api/cycles'),
        fetchCached<{ prediction: PredictionSummary | null }>('/api/predictions/current'),
        fetchCached<{ log: DailyLogState | null }>('/api/daily-logs/today'),
      ]);
      setCycles(cyclesRes.data.cycles);
      setTodayLogged(cyclesRes.data.todayLogged);
      setPrediction(predictionRes.data.prediction);
      if (predictionRes.data.prediction && !predictionViewedTracked.current) {
        predictionViewedTracked.current = true;
        track('prediction_viewed', {
          type: predictionRes.data.prediction.fertileWindowStart ? 'full' : 'period_only',
          confidence: predictionRes.data.prediction.confidence,
        });
      }
      setTodayLog(
        logRes.data.log ?? {
          painLevel: null,
          painLocation: null,
          mood: null,
          energy: null,
          sleepQuality: null,
          sleepHours: null,
          note: null,
          symptoms: [],
        },
      );
      const stale = [cyclesRes, predictionRes, logRes].find((r) => r.stale);
      setOfflineCachedAt(stale?.cachedAt ?? null);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => onCycleDataChanged(() => void load()), [load]);

  const handleLog = useCallback(() => {
    setLogging(true);
    void (async () => {
      try {
        const result = await runOrQueue(
          `period-event:${todayIso()}`,
          '/api/period-events',
          'POST',
          {},
        );
        if (result.queued) {
          toast('Hors ligne — sera synchronisé automatiquement.', 'info');
        }
        track('period_logged', { offline_flag: result.queued });
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

  const handleMoodSelect = useCallback(
    (mood: string) => {
      if (!todayLog) return;
      setSavingMood(true);
      void (async () => {
        try {
          const nextMood = todayLog.mood === mood ? null : mood;
          const result = await runOrQueue(
            `daily-log:${todayIso()}`,
            '/api/daily-logs/today',
            'PUT',
            { ...todayLog, mood: nextMood },
          );
          setTodayLog({ ...todayLog, mood: nextMood });
          if (result.queued) {
            toast('Hors ligne — sera synchronisé automatiquement.', 'info');
          }
        } catch (err) {
          toast(
            err instanceof ApiError ? err.message : 'Impossible d’enregistrer. Réessaie.',
            'error',
          );
        } finally {
          setSavingMood(false);
        }
      })();
    },
    [todayLog, toast],
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

  if (cycles === null || todayLog === null) {
    return (
      <div className="p-4 lg:p-8">
        <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const mostRecent = cycles[0] ?? null;
  const today = todayIso();
  const currentDay = mostRecent ? daysBetween(mostRecent.startDate, today) + 1 : null;
  const estimatedLength =
    prediction && mostRecent
      ? daysBetween(mostRecent.startDate, prediction.expectedPeriodStart)
      : null;
  const fertileStartDay =
    mostRecent && prediction?.fertileWindowStart
      ? daysBetween(mostRecent.startDate, prediction.fertileWindowStart) + 1
      : null;
  const fertileEndDay =
    mostRecent && prediction?.fertileWindowEnd
      ? daysBetween(mostRecent.startDate, prediction.fertileWindowEnd) + 1
      : null;
  const dayTypes = buildDayTypes(cycles, prediction, today);

  return (
    <div className="p-4 lg:p-8">
      {offlineCachedAt && <OfflineDataBanner cachedAt={offlineCachedAt} />}
      <div
        className="animate-fade-in-up mb-6 rounded-xl p-6"
        style={{ background: 'linear-gradient(135deg, #F8F5FD 0%, #FDF5F9 100%)' }}
      >
        <h1 className="mb-1 text-2xl font-bold text-navy">Bonjour {greetingName(user.email)} 👋</h1>
        <p className="text-sm text-body">
          Aujourd&rsquo;hui est une belle journée pour prendre soin de toi.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ton bien-être compte. Tu avances dans la bonne direction !
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px_280px]">
        <div className="animate-fade-in-up flex flex-col gap-5" style={staggerDelay(1)}>
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-white p-6 sm:flex-row sm:items-start">
            <CycleRing
              currentDay={currentDay}
              estimatedLength={estimatedLength}
              fertileStartDay={fertileStartDay}
              fertileEndDay={fertileEndDay}
            />
            <div className="flex w-full flex-1 flex-col items-center gap-3 sm:items-start">
              <PeriodLogCta todayLogged={todayLogged} onLog={handleLog} loading={logging} />
            </div>
          </div>
          <MoodSelector
            selectedMood={todayLog.mood}
            saving={savingMood}
            onSelect={handleMoodSelect}
          />
        </div>

        <div className="animate-fade-in-up flex flex-col gap-5" style={staggerDelay(2)}>
          <PredictionCards prediction={prediction} hasCycles={cycles.length > 0} today={today} />
          <DailyTip />
        </div>

        <div className="animate-fade-in-up flex flex-col gap-5" style={staggerDelay(3)}>
          <MiniCalendar dayTypes={dayTypes} />
          <ProjetBebeCard />
        </div>
      </div>
    </div>
  );
}
