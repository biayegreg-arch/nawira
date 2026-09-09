import 'server-only';
import type {
  InsightsResult,
  Insight,
  CycleScoreTrendInsight,
  TopSymptomsInsight,
} from '../insights/compute-insights';
import type { CyclePhase } from '../insights/cycle-phase';

export interface PredictionForContext {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedPeriodStart: string; // ISO date, e.g. "2026-03-15"
  ovulationEstimate: string | null;
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
}

export interface UserContextInput {
  prediction: PredictionForContext | null;
  insights: InsightsResult;
}

const CONFIDENCE_LABEL: Record<PredictionForContext['confidence'], string> = {
  LOW: 'faible',
  MEDIUM: 'moyenne',
  HIGH: 'élevée',
};

const PHASE_LABEL: Record<CyclePhase, string> = {
  MENSTRUAL: 'phase menstruelle',
  FOLLICULAR: 'phase folliculaire',
  OVULATORY: 'phase ovulatoire',
  LUTEAL: 'phase lutéale',
};

const PHASE_ORDER: CyclePhase[] = ['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL'];

const NOT_ENOUGH_DATA =
  "Cette utilisatrice n'a pas encore assez de données enregistrées pour une analyse détaillée de son cycle.";

function isCycleScoreTrend(i: Insight): i is CycleScoreTrendInsight {
  return i.type === 'CYCLE_SCORE_TREND';
}

function isTopSymptoms(i: Insight): i is TopSymptomsInsight {
  return i.type === 'TOP_SYMPTOMS';
}

/**
 * Pure formatter — turns already-fetched structured data (never free text,
 * spec §4) into a French paragraph prepended to the user's chat message.
 * The DB fetch and deriveInsights() call happen in route.ts (Task 8); this
 * function only formats what it's given.
 */
export function formatUserContext(input: UserContextInput): string {
  const lines: string[] = [];

  if (input.prediction) {
    lines.push(
      `Prochaines règles estimées : ${input.prediction.expectedPeriodStart} (confiance : ${CONFIDENCE_LABEL[input.prediction.confidence]}).`,
    );
    if (input.prediction.ovulationEstimate) {
      lines.push(`Ovulation estimée : ${input.prediction.ovulationEstimate}.`);
    }
    if (input.prediction.fertileWindowStart && input.prediction.fertileWindowEnd) {
      lines.push(
        `Fenêtre fertile estimée : du ${input.prediction.fertileWindowStart} au ${input.prediction.fertileWindowEnd}.`,
      );
    }
  }

  if (input.insights.cycleScoreToday !== null) {
    lines.push(`Cycle Score du jour : ${input.insights.cycleScoreToday}/100.`);
  }

  if (input.insights.eligible) {
    const trend = input.insights.insights.find(isCycleScoreTrend);
    if (trend && trend.data.current !== null && trend.data.previous !== null) {
      lines.push(
        `Tendance du Cycle Score : ${trend.data.previous} -> ${trend.data.current} (cycle précédent -> cycle actuel).`,
      );
    }

    const topSymptoms = input.insights.insights.find(isTopSymptoms);
    if (topSymptoms) {
      const entries: string[] = [];
      for (const phase of PHASE_ORDER) {
        const top = topSymptoms.data.byPhase[phase][0];
        if (top) entries.push(`${top.symptom} (${PHASE_LABEL[phase]})`);
      }
      if (entries.length > 0) {
        lines.push(`Symptômes fréquents : ${entries.join(', ')}.`);
      }
    }
  }

  if (lines.length === 0) return NOT_ENOUGH_DATA;

  return `Voici ce que NAWIRA sait du cycle de cette utilisatrice :\n- ${lines.join('\n- ')}`;
}
