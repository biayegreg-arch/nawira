'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { CycleListItem } from '@/components/cycles/CycleListItem';

interface CycleSummary {
  startDate: string;
  endDate: string | null;
  length: number | null;
  isOutlier: boolean;
}

interface PredictionSummary {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

const CONFIDENCE_LABELS: Record<PredictionSummary['confidence'], string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: 'Élevée',
};

export default function CyclesHistoryPage(): React.JSX.Element | null {
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

  if (!user) return null;

  if (error) {
    return (
      <div className="p-4 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger ton historique. Réessaie plus tard.
        </div>
      </div>
    );
  }

  if (cycles === null) {
    return (
      <div className="p-4 lg:p-8">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const completedCount = cycles.filter((c) => c.endDate !== null).length;

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href="/app/today" className="flex items-center gap-2 text-muted-foreground">
          <ArrowLeft size={16} />
          Tableau de bord
        </Link>
        <span className="text-muted-light">/</span>
        <span className="font-medium text-navy">Historique des cycles</span>
      </div>

      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-navy">
        <span>🔄</span>
        Mon historique de cycles
      </h1>

      {cycles.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-6 text-sm text-muted-foreground">
          Tu n&rsquo;as pas encore de cycle enregistré. Enregistre tes règles sur l&rsquo;écran
          Accueil pour commencer.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            {cycles.map((cycle) => (
              <CycleListItem key={cycle.startDate} {...cycle} />
            ))}
          </div>

          <div className="rounded-xl border border-border bg-white p-6">
            <h2 className="mb-4 text-base font-bold text-navy">Pourquoi cette estimation ?</h2>
            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green" />
                <span>Tu enregistres tes règles régulièrement.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green" />
                <span>
                  {completedCount} cycle{completedCount !== 1 ? 's' : ''} complet
                  {completedCount !== 1 ? 's' : ''} enregistré{completedCount !== 1 ? 's' : ''}.
                </span>
              </div>
              {prediction && (
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green" />
                  <span>
                    Confiance actuelle de la prédiction : {CONFIDENCE_LABELS[prediction.confidence]}
                    .
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
