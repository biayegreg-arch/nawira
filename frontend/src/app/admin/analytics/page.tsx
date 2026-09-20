'use client';

import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AnalyticsEventType } from '@/lib/analytics/events';

interface OverviewResponse {
  windowDays: number;
  activeUsers: number;
  eventCounts: Record<AnalyticsEventType, number>;
  previousEventCounts: Record<AnalyticsEventType, number>;
  onboardingFunnel: {
    started: number;
    goalSelected: number;
    completed: number;
    startedToGoalRate: number | null;
    goalToCompletedRate: number | null;
    startedToCompletedRate: number | null;
  };
}

// French label + category per event — every one of these is a real,
// schema-declared event from lib/analytics/events.ts. Events with no real
// integration point anywhere in the app (checkout/subscription/privacy —
// payments were pruned, export/delete don't call trackEvent) still show
// here with an honest 0 count, not hidden — hiding them would misrepresent
// what's actually instrumented.
const EVENT_GROUPS: Array<{ title: string; events: AnalyticsEventType[] }> = [
  {
    title: 'Onboarding',
    events: ['onboarding_started', 'goal_selected', 'onboarding_completed'],
  },
  {
    title: 'Usage du cycle',
    events: [
      'period_logged',
      'daily_log_saved',
      'prediction_viewed',
      'insight_viewed',
      'third_cycle_completed',
    ],
  },
  { title: 'Assistant NAWIRA', events: ['assistant_used'] },
  {
    title: 'Abonnement',
    events: [
      'paywall_viewed',
      'checkout_started',
      'subscription_activated',
      'subscription_cancelled',
    ],
  },
  {
    title: 'Confidentialité',
    events: ['privacy_export_requested', 'account_delete_requested'],
  },
  {
    title: 'PWA & synchronisation',
    events: [
      'pwa_install_prompt_shown',
      'pwa_installed',
      'offline_mode_entered',
      'sync_completed',
      'sync_failed',
    ],
  },
];

const EVENT_LABELS: Record<AnalyticsEventType, string> = {
  onboarding_started: 'Onboarding démarré',
  goal_selected: 'Objectif choisi',
  onboarding_completed: 'Onboarding terminé',
  period_logged: 'Règles enregistrées',
  daily_log_saved: 'Journal quotidien enregistré',
  prediction_viewed: 'Prédiction consultée',
  insight_viewed: 'Analyse consultée',
  third_cycle_completed: '3e cycle complété',
  assistant_used: 'Message à l’assistant',
  paywall_viewed: 'Page abonnement vue',
  checkout_started: 'Paiement démarré',
  subscription_activated: 'Abonnement activé',
  subscription_cancelled: 'Abonnement annulé',
  privacy_export_requested: 'Export de données demandé',
  account_delete_requested: 'Suppression de compte demandée',
  pwa_install_prompt_shown: 'Invite d’installation affichée',
  pwa_installed: 'Application installée',
  offline_mode_entered: 'Passage hors ligne',
  sync_completed: 'Synchronisation réussie',
  sync_failed: 'Synchronisation échouée',
};

const WINDOW_OPTIONS = [7, 30, 90] as const;

function formatPercent(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

function Trend({ current, previous }: { current: number; previous: number }): React.JSX.Element {
  if (current === previous) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus size={12} />
        stable
      </span>
    );
  }
  const up = current > previous;
  const delta = previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${up ? 'text-green' : 'text-danger'}`}
    >
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {delta === null ? (up ? 'nouveau' : '—') : `${delta > 0 ? '+' : ''}${delta}%`}
    </span>
  );
}

export default function AdminAnalyticsPage(): React.JSX.Element {
  const [days, setDays] = useState<(typeof WINDOW_OPTIONS)[number]>(30);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (windowDays: number) => {
    setError(null);
    try {
      const res = await api<OverviewResponse>(`/api/admin/analytics/overview?days=${windowDays}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
  }, []);

  useEffect(() => {
    setData(null);
    void load(days);
  }, [days, load]);

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Événements produits privacy-safe — données réelles, aucune métrique estimée.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-white p-1">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setDays(opt)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === opt ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-gray-50'
              }`}
            >
              {opt} j
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {data === null && !error ? (
        <div className="grid gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : data ? (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-border bg-white p-5">
            <p className="text-xs text-muted-foreground">
              Utilisatrices actives (≥1 événement sur {data.windowDays} jours)
            </p>
            <p className="mt-1 text-3xl font-bold text-navy">{data.activeUsers}</p>
          </div>

          <div className="rounded-xl border border-border bg-white p-5">
            <h2 className="mb-4 text-base font-bold text-navy">Entonnoir d’onboarding</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Démarré</p>
                <p className="text-2xl font-bold text-navy">{data.onboardingFunnel.started}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Objectif choisi ({formatPercent(data.onboardingFunnel.startedToGoalRate)})
                </p>
                <p className="text-2xl font-bold text-navy">{data.onboardingFunnel.goalSelected}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Terminé ({formatPercent(data.onboardingFunnel.goalToCompletedRate)})
                </p>
                <p className="text-2xl font-bold text-navy">{data.onboardingFunnel.completed}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Conversion bout en bout :{' '}
              {formatPercent(data.onboardingFunnel.startedToCompletedRate)}
            </p>
          </div>

          {EVENT_GROUPS.map((group) => (
            <div key={group.title} className="rounded-xl border border-border bg-white p-5">
              <h2 className="mb-4 text-base font-bold text-navy">{group.title}</h2>
              <div className="flex flex-col divide-y divide-border">
                {group.events.map((type) => (
                  <div key={type} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="text-sm text-navy">{EVENT_LABELS[type]}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-navy">
                        {data.eventCounts[type]}
                      </span>
                      <Trend
                        current={data.eventCounts[type]}
                        previous={data.previousEventCounts[type]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
