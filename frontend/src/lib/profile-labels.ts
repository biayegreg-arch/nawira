// French display labels for Profile enum fields. Duplicated (not imported)
// from the onboarding pages' page-local consts — those aren't exported and
// pulling from an onboarding route file into /app/profile would be a layer
// violation for a handful of static strings.

export const GOAL_LABELS: Record<string, string> = {
  PERIOD_TRACKING: 'Suivre mes règles',
  UNDERSTAND_CYCLE: 'Comprendre mon cycle',
  TRYING_TO_CONCEIVE: 'Projet bébé',
};

export const CONCERN_LABELS: Record<string, string> = {
  PAIN: 'Douleurs',
  MOOD: 'Humeur',
  FATIGUE: 'Fatigue',
  SLEEP: 'Sommeil',
  PMS: 'SPM',
  IRREGULARITY: 'Irrégularité',
  OVULATION: 'Ovulation',
};
