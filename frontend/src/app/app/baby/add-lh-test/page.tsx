'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Info, ClipboardCheck, Calendar, Lightbulb, History } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { runOrQueue } from '@/lib/offline/queue';
import { todayIso } from '@/lib/calendar-day-types';
import { ProjetBebeBreadcrumb } from '@/components/baby/ProjetBebeBreadcrumb';
import { formatFrenchDate } from '@/lib/format-date';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

interface CycleSummary {
  startDate: string;
  endDate: string | null;
}

interface PredictionSummary {
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

interface RecentLhEntry {
  date: string;
  lhResult: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EMPTY_SIGNALS: TodaySignals = {
  temperatureValue: null,
  temperatureUnit: null,
  cervicalMucusType: null,
  lhResult: null,
};

const RESULT_OPTIONS: Array<{
  value: string;
  label: string;
  desc: string;
  icon: string;
  color: string;
  bg: string;
}> = [
  {
    value: 'PEAK',
    label: 'Pic positif',
    desc: 'Pic de LH détecté — ovulation probable dans 24-36h',
    icon: '✅',
    color: 'text-green',
    bg: 'bg-green-soft',
  },
  {
    value: 'POSITIVE',
    label: 'Positif',
    desc: 'LH présent mais pas de pic détecté',
    icon: '🟡',
    color: 'text-amber',
    bg: 'bg-amber-soft',
  },
  {
    value: 'NEGATIVE',
    label: 'Négatif',
    desc: 'Pas de LH détecté',
    icon: '⚪',
    color: 'text-muted-foreground',
    bg: 'bg-gray-100',
  },
  {
    value: 'INCONCLUSIVE',
    label: 'Non concluant',
    desc: 'Résultat illisible ou test invalide',
    icon: '❔',
    color: 'text-muted-foreground',
    bg: 'bg-gray-100',
  },
];

const RESULT_LABELS: Record<string, string> = Object.fromEntries(
  RESULT_OPTIONS.map((o) => [o.value, o.label]),
);

const INTERPRETATION: Record<string, string> = {
  PEAK: "L'ovulation devrait se produire dans les 24 à 36 heures suivant un pic de LH.",
  POSITIVE: 'Un pic pourrait suivre dans les prochains jours — un nouveau test est utile.',
  NEGATIVE: 'Continue à tester si tu es proche de ta fenêtre fertile estimée.',
  INCONCLUSIVE: 'Réessaie plus tard dans la journée avec un nouveau test.',
};

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY);
}

export default function AddLhTestPage(): React.JSX.Element | null {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null);
  const [prediction, setPrediction] = useState<PredictionSummary | null>(null);
  const [signals, setSignals] = useState<TodaySignals>(EMPTY_SIGNALS);
  const [recentEntries, setRecentEntries] = useState<RecentLhEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [cyclesRes, predictionRes, signalsRes, recentRes] = await Promise.all([
        api<{ cycles: CycleSummary[] }>('/api/cycles'),
        api<{ prediction: PredictionSummary | null }>('/api/predictions/current'),
        api<{ signal: TodaySignals | null }>('/api/fertility-signals/today'),
        api<{ entries: RecentLhEntry[] }>('/api/fertility-signals/recent'),
      ]);
      setCycles(cyclesRes.cycles);
      setPrediction(predictionRes.prediction);
      const todaySignals = signalsRes.signal ?? EMPTY_SIGNALS;
      setSignals(todaySignals);
      setSelected(todaySignals.lhResult);
      setRecentEntries(recentRes.entries);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const handleSave = useCallback(() => {
    if (!selected) return;
    setSaving(true);
    void (async () => {
      try {
        const merged: TodaySignals = { ...signals, lhResult: selected };
        const result = await runOrQueue(
          `fertility-signal:${todayIso()}`,
          '/api/fertility-signals/today',
          'PUT',
          merged,
        );
        toast(
          result.queued ? 'Hors ligne — sera synchronisé automatiquement.' : 'Test LH enregistré.',
          result.queued ? 'info' : 'success',
        );
        router.push('/app/baby');
      } catch (err) {
        toast(
          err instanceof ApiError ? err.message : 'Impossible d’enregistrer. Réessaie.',
          'error',
        );
      } finally {
        setSaving(false);
      }
    })();
  }, [selected, signals, toast, router]);

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
        <div className="h-96 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const today = todayIso();
  const mostRecent = cycles[0] ?? null;
  const currentDay = mostRecent ? daysBetween(mostRecent.startDate, today) + 1 : null;

  let fertileStatus = '—';
  if (prediction?.fertileWindowStart && prediction.fertileWindowEnd) {
    if (today < prediction.fertileWindowStart) {
      fertileStatus = `Dans ${daysBetween(today, prediction.fertileWindowStart)} jour(s)`;
    } else if (today <= prediction.fertileWindowEnd) {
      fertileStatus = 'En cours';
    } else {
      fertileStatus = 'Terminée';
    }
  }

  return (
    <div className="p-4 lg:p-8">
      <ProjetBebeBreadcrumb current="Ajouter un test LH" />
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-3 text-2xl font-bold text-navy">
          <span className="text-3xl">🩺</span>
          Ajouter un test LH
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatFrenchDate(today)}
          {currentDay !== null ? ` — Jour ${currentDay} de ton cycle` : ''}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_288px] lg:items-start">
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-white p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-soft text-amber">
                <Info size={18} />
              </div>
              <div>
                <h2 className="mb-1 text-base font-bold text-navy">
                  Qu&rsquo;est-ce qu&rsquo;un test LH ?
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Le test LH détecte l&rsquo;hormone lutéinisante. Un pic de LH indique que
                  l&rsquo;ovulation devrait se produire dans les 24 à 36 heures suivantes.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5 rounded-xl border border-border bg-white p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-navy">
              <ClipboardCheck size={18} className="text-primary" />
              Résultat du test
            </h2>

            <div className="flex flex-col gap-3">
              {RESULT_OPTIONS.map((option) => {
                const isSelected = selected === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelected(option.value)}
                    className={`flex w-full items-center gap-4 rounded-lg border-2 p-4 text-left transition-all duration-150 active:scale-[0.98] ${
                      isSelected ? `border-primary ${option.bg}` : 'border-border bg-gray-50'
                    }`}
                  >
                    <span className="shrink-0 text-2xl">{option.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-navy">{option.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{option.desc}</div>
                    </div>
                    <div
                      className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                        isSelected ? 'border-primary bg-primary' : 'border-gray-300'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/app/baby')}
              className="flex-1 rounded-lg border border-border bg-gray-50 px-4 py-3 text-sm font-semibold text-navy transition-transform duration-150 active:scale-[0.97]"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!selected || saving}
              className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer le test'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy">
              <Calendar size={14} className="text-rose" />
              Ton cycle aujourd&rsquo;hui
            </h3>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Jour du cycle</span>
                <span className="font-semibold text-navy">
                  {currentDay !== null ? <AnimatedNumber value={currentDay} /> : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fenêtre fertile</span>
                <span className="font-semibold text-green">{fertileStatus}</span>
              </div>
              {prediction?.ovulationEstimate && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Ovulation estimée</span>
                  <span className="font-semibold text-navy">
                    ≈ {formatFrenchDate(prediction.ovulationEstimate)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {selected && (
            <div className="animate-fade-in-up rounded-xl border border-border bg-amber-soft p-5">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-navy">
                <Lightbulb size={14} className="text-amber" />
                Interprétation
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {INTERPRETATION[selected]}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy">
              <History size={14} className="text-primary" />
              Tests LH récents
            </h3>
            {recentEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun test précédent enregistré.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentEntries.map((entry) => (
                  <div key={entry.date} className="flex items-center justify-between py-1 text-xs">
                    <span className="text-muted-foreground">{shortDate(entry.date)}</span>
                    <span className="font-medium text-navy">
                      {RESULT_LABELS[entry.lhResult] ?? entry.lhResult}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-green-soft p-5">
            <h3 className="mb-2 flex items-center gap-1 text-xs font-bold text-navy">
              <Info size={12} className="text-green" />
              Pourquoi tracer les tests LH ?
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Coupler NAWIRA avec des tests LH peut améliorer la précision de l&rsquo;identification
              de ta fenêtre fertile.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
