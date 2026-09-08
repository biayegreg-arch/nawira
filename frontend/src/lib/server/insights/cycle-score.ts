import 'server-only';

export interface DailyLogForScore {
  mood: string | null; // VERY_GOOD | GOOD | TIRED | STRESSED | LOW
  energy: string | null; // VERY_LOW | LOW | MEDIUM | HIGH | VERY_HIGH
  sleepQuality: string | null; // POOR | FAIR | GOOD | EXCELLENT
  painLevel: number | null; // 0-10
  symptomCount: number; // SymptomLog rows for that day
}

const MOOD_SCORE: Record<string, number> = {
  LOW: 0,
  STRESSED: 25,
  TIRED: 50,
  GOOD: 75,
  VERY_GOOD: 100,
};

const ENERGY_SCORE: Record<string, number> = {
  VERY_LOW: 0,
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  VERY_HIGH: 100,
};

const SLEEP_SCORE: Record<string, number> = {
  POOR: 0,
  FAIR: 33,
  GOOD: 67,
  EXCELLENT: 100,
};

const MIN_DIMENSIONS_FOR_SCORE = 2;

/**
 * PRD §9.2: "score d'expérience/journal, pas un score médical" — a
 * normalized 0-100 average of up to 4 self-reported dimensions. Symptoms
 * are inverted (fewer/less-severe symptoms -> higher score). Returns
 * `null` when fewer than `MIN_DIMENSIONS_FOR_SCORE` dimensions are
 * present that day (PRD §9.2, exact threshold) — never a score built
 * from a single data point.
 *
 * The symptom/pain dimension counts as "present" when EITHER `painLevel`
 * is set OR at least one symptom was logged — a day with both null/0
 * contributes no symptom dimension at all (not a 0-burden "perfect"
 * score), since silence isn't evidence of "no pain."
 */
export function computeDailyCycleScore(log: DailyLogForScore): number | null {
  const dims: number[] = [];

  if (log.mood !== null) {
    const s = MOOD_SCORE[log.mood];
    if (s !== undefined) dims.push(s);
  }
  if (log.energy !== null) {
    const s = ENERGY_SCORE[log.energy];
    if (s !== undefined) dims.push(s);
  }
  if (log.sleepQuality !== null) {
    const s = SLEEP_SCORE[log.sleepQuality];
    if (s !== undefined) dims.push(s);
  }
  if (log.painLevel !== null || log.symptomCount > 0) {
    const burden = Math.min(100, (log.painLevel ?? 0) * 10 + log.symptomCount * 10);
    dims.push(100 - burden);
  }

  if (dims.length < MIN_DIMENSIONS_FOR_SCORE) return null;
  return Math.round(dims.reduce((sum, d) => sum + d, 0) / dims.length);
}
