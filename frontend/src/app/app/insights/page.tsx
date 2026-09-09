'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart2 } from 'lucide-react';
import { useUser } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  CycleScoreCard,
  type CycleVariabilityData,
  type AvgCycleLengthData,
} from '@/components/insights/CycleScoreCard';
import { SymptomStatistics, type TopSymptomsData } from '@/components/insights/SymptomStatistics';
import {
  MoodDistributionChart,
  type MoodDistributionData,
} from '@/components/insights/MoodDistributionChart';
import {
  CycleComparisonCard,
  type CycleComparisonData,
} from '@/components/insights/CycleComparisonCard';
import { AnalyticsRecommendations } from '@/components/insights/AnalyticsRecommendations';

interface CycleScoreTrendData {
  current: number | null;
  previous: number | null;
}

type Insight =
  | { type: 'AVG_CYCLE_LENGTH'; evidenceCount: number; data: AvgCycleLengthData }
  | {
      type: 'AVG_PERIOD_LENGTH';
      evidenceCount: number;
      data: { average: number; min: number; max: number };
    }
  | { type: 'CYCLE_VARIABILITY'; evidenceCount: number; data: CycleVariabilityData }
  | { type: 'TOP_SYMPTOMS'; evidenceCount: number; data: TopSymptomsData }
  | { type: 'CYCLE_COMPARISON'; evidenceCount: number; data: CycleComparisonData }
  | { type: 'CYCLE_SCORE_TREND'; evidenceCount: number; data: CycleScoreTrendData }
  | { type: 'MOOD_DISTRIBUTION'; evidenceCount: number; data: MoodDistributionData };

interface InsightsResponse {
  eligible: boolean;
  cycleScoreToday: number | null;
  insights: Insight[];
  meta: { completeCyclesAnalyzed: number; dailyLogsAnalyzed: number };
}

interface PredictionSummary {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

function cycleScoreTrendOf(insights: Insight[]): CycleScoreTrendData | null {
  const found = insights.find((i) => i.type === 'CYCLE_SCORE_TREND');
  return found && found.type === 'CYCLE_SCORE_TREND' ? found.data : null;
}
function cycleVariabilityOf(insights: Insight[]): CycleVariabilityData | null {
  const found = insights.find((i) => i.type === 'CYCLE_VARIABILITY');
  return found && found.type === 'CYCLE_VARIABILITY' ? found.data : null;
}
function avgCycleLengthOf(insights: Insight[]): AvgCycleLengthData | null {
  const found = insights.find((i) => i.type === 'AVG_CYCLE_LENGTH');
  return found && found.type === 'AVG_CYCLE_LENGTH' ? found.data : null;
}
function topSymptomsOf(insights: Insight[]): TopSymptomsData | null {
  const found = insights.find((i) => i.type === 'TOP_SYMPTOMS');
  return found && found.type === 'TOP_SYMPTOMS' ? found.data : null;
}
function cycleComparisonOf(insights: Insight[]): CycleComparisonData | null {
  const found = insights.find((i) => i.type === 'CYCLE_COMPARISON');
  return found && found.type === 'CYCLE_COMPARISON' ? found.data : null;
}
function moodDistributionOf(insights: Insight[]): MoodDistributionData | null {
  const found = insights.find((i) => i.type === 'MOOD_DISTRIBUTION');
  return found && found.type === 'MOOD_DISTRIBUTION' ? found.data : null;
}

export default function InsightsPage(): React.JSX.Element | null {
  const user = useUser();
  const [result, setResult] = useState<InsightsResponse | null>(null);
  const [confidence, setConfidence] = useState<'LOW' | 'MEDIUM' | 'HIGH' | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [insightsRes, predictionRes] = await Promise.all([
        api<InsightsResponse>('/api/insights'),
        api<{ prediction: PredictionSummary | null }>('/api/predictions/current'),
      ]);
      setResult(insightsRes);
      setConfidence(predictionRes.prediction?.confidence ?? null);
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
          Impossible de charger tes analyses. Réessaie plus tard.
        </div>
      </div>
    );
  }

  if (result === null) {
    return (
      <div className="p-4 lg:p-8">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const cycleScoreTrend = cycleScoreTrendOf(result.insights);
  const cycleVariability = cycleVariabilityOf(result.insights);
  const avgCycleLength = avgCycleLengthOf(result.insights);
  const topSymptoms = topSymptomsOf(result.insights);
  const cycleComparison = cycleComparisonOf(result.insights);
  const moodDistribution = moodDistributionOf(result.insights);

  const headlineScore = cycleScoreTrend?.current ?? result.cycleScoreToday;
  const headlineLabel =
    cycleScoreTrend?.current != null ? 'Score moyen de ce cycle' : 'Ton score aujourd’hui';

  const nothingToShow = result.insights.length === 0 && result.cycleScoreToday === null;

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Analyses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Découvre tes tendances et reçois des recommandations personnalisées
        </p>
      </div>

      {nothingToShow ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center">
          <BarChart2 size={32} className="mx-auto mb-3 text-muted-foreground" />
          <h2 className="mb-2 text-base font-bold text-navy">Pas encore assez de données</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Commence à enregistrer tes données quotidiennes pour débloquer tes analyses.
          </p>
          <Link
            href="/app/log"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            Enregistrer aujourd&rsquo;hui
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <CycleScoreCard
                headlineScore={headlineScore}
                headlineLabel={headlineLabel}
                cycleVariability={cycleVariability}
                avgCycleLength={avgCycleLength}
                confidence={confidence}
                dailyLogsAnalyzed={result.meta.dailyLogsAnalyzed}
              />
              <CycleComparisonCard cycleComparison={cycleComparison} />
            </div>
            <div className="flex flex-col gap-6">
              <SymptomStatistics topSymptoms={topSymptoms} />
              <MoodDistributionChart moodDistribution={moodDistribution} />
            </div>
          </div>

          <div className="mt-6">
            <AnalyticsRecommendations
              cycleVariability={cycleVariability}
              topSymptoms={topSymptoms}
              moodDistribution={moodDistribution}
              eligible={result.eligible}
            />
          </div>

          <div className="mt-6 rounded-lg border border-primary bg-primary-faint p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-navy">
                  <span>👑</span>
                  Analyses avancées disponibles
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Débloque des analyses IA plus profondes, des prédictions améliorées et des
                  rapports PDF avec NAWIRA Plus.
                </p>
                <Link
                  href="/app/billing"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
                >
                  Essayer gratuitement
                </Link>
              </div>
              <span className="shrink-0 text-4xl">✨</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
