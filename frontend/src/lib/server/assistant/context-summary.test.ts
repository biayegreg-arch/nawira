import { describe, it, expect } from 'vitest';
import { formatUserContext, type PredictionForContext } from './context-summary';
import type { InsightsResult } from '../insights/compute-insights';

function emptyInsights(overrides: Partial<InsightsResult> = {}): InsightsResult {
  return {
    eligible: false,
    cycleScoreToday: null,
    insights: [],
    meta: { completeCyclesAnalyzed: 0, dailyLogsAnalyzed: 0 },
    ...overrides,
  };
}

describe('formatUserContext', () => {
  it('returns a "not enough data" sentence when there is no prediction and no insights', () => {
    const result = formatUserContext({ prediction: null, insights: emptyInsights() });
    expect(result).toBe(
      "Cette utilisatrice n'a pas encore assez de données enregistrées pour une analyse détaillée de son cycle.",
    );
  });

  it('formats a prediction + cycleScoreToday with no eligible insights', () => {
    const prediction: PredictionForContext = {
      confidence: 'MEDIUM',
      expectedPeriodStart: '2026-03-15',
      ovulationEstimate: '2026-03-01',
      fertileWindowStart: '2026-02-27',
      fertileWindowEnd: '2026-03-03',
    };
    const result = formatUserContext({
      prediction,
      insights: emptyInsights({ cycleScoreToday: 72 }),
    });
    expect(result).toBe(
      'Voici ce que NAWIRA sait du cycle de cette utilisatrice :\n' +
        '- Prochaines règles estimées : 2026-03-15 (confiance : moyenne).\n' +
        '- Ovulation estimée : 2026-03-01.\n' +
        '- Fenêtre fertile estimée : du 2026-02-27 au 2026-03-03.\n' +
        '- Cycle Score du jour : 72/100.',
    );
  });

  it('formats CYCLE_SCORE_TREND and TOP_SYMPTOMS when eligible', () => {
    const insights: InsightsResult = emptyInsights({
      eligible: true,
      insights: [
        { type: 'CYCLE_SCORE_TREND', evidenceCount: 3, data: { current: 65, previous: 80 } },
        {
          type: 'TOP_SYMPTOMS',
          evidenceCount: 6,
          data: {
            byPhase: {
              MENSTRUAL: [{ symptom: 'CRAMPS', count: 3, frequency: 1 }],
              FOLLICULAR: [],
              OVULATORY: [],
              LUTEAL: [{ symptom: 'FATIGUE', count: 2, frequency: 0.5 }],
            },
            daysLogged: { MENSTRUAL: 3, FOLLICULAR: 0, OVULATORY: 0, LUTEAL: 4 },
          },
        },
      ],
      meta: { completeCyclesAnalyzed: 3, dailyLogsAnalyzed: 6 },
    });
    const result = formatUserContext({ prediction: null, insights });
    expect(result).toBe(
      'Voici ce que NAWIRA sait du cycle de cette utilisatrice :\n' +
        '- Tendance du Cycle Score : 80 -> 65 (cycle précédent -> cycle actuel).\n' +
        '- Symptômes fréquents : CRAMPS (phase menstruelle), FATIGUE (phase lutéale).',
    );
  });

  it('omits the trend line when both sides of CYCLE_SCORE_TREND are null', () => {
    const insights: InsightsResult = emptyInsights({
      eligible: true,
      insights: [
        { type: 'CYCLE_SCORE_TREND', evidenceCount: 2, data: { current: null, previous: null } },
      ],
      meta: { completeCyclesAnalyzed: 2, dailyLogsAnalyzed: 0 },
    });
    const result = formatUserContext({ prediction: null, insights });
    expect(result).toBe(
      "Cette utilisatrice n'a pas encore assez de données enregistrées pour une analyse détaillée de son cycle.",
    );
  });
});
