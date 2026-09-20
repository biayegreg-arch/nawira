import { Lightbulb, Activity, Droplet, Moon, Info, type LucideIcon } from 'lucide-react';
import { PHASE_LABELS, type CyclePhase, type TopSymptomsData } from './SymptomStatistics';
import type { CycleVariabilityData } from './CycleScoreCard';
import type { MoodDistributionData } from './MoodDistributionChart';

interface AnalyticsRecommendationsProps {
  cycleVariability: CycleVariabilityData | null;
  topSymptoms: TopSymptomsData | null;
  moodDistribution: MoodDistributionData | null;
  eligible: boolean;
}

interface Tip {
  icon: LucideIcon;
  iconClassName: string;
  bgClassName: string;
  title: string;
  body: string;
}

const PHASE_ORDER: CyclePhase[] = ['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL'];

const FALLBACK_TIPS: Tip[] = [
  {
    icon: Activity,
    iconClassName: 'text-primary',
    bgClassName: 'bg-primary-faint',
    title: 'Continue à enregistrer tes journées',
    body: 'Plus tu ajoutes de données (humeur, énergie, symptômes), plus tes analyses deviendront précises et personnalisées.',
  },
  {
    icon: Moon,
    iconClassName: 'text-primary',
    bgClassName: 'bg-primary-faint',
    title: 'Priorise le repos quand tu en ressens le besoin',
    body: 'Écouter les signaux de ton corps, notamment la fatigue, peut aider à mieux traverser les différentes phases de ton cycle.',
  },
];

function topOverallSymptom(
  topSymptoms: TopSymptomsData,
): { symptom: string; phase: CyclePhase; frequency: number } | null {
  let best: { symptom: string; phase: CyclePhase; frequency: number } | null = null;
  for (const phase of PHASE_ORDER) {
    const top = topSymptoms.byPhase[phase][0];
    if (top && (!best || top.frequency > best.frequency)) {
      best = { symptom: top.symptom, phase, frequency: top.frequency };
    }
  }
  return best;
}

const SYMPTOM_LABELS: Record<string, string> = {
  CRAMPS: 'les crampes',
  HEADACHE: 'les maux de tête',
  BLOATING: 'les ballonnements',
  NAUSEA: 'les nausées',
  ACNE: "l'acné",
  TENDER_BREASTS: 'la sensibilité des seins',
  FATIGUE: 'la fatigue',
  BACK_PAIN: 'les douleurs dorsales',
  CONSTIPATION: 'la constipation',
  DIARRHEA: 'la diarrhée',
  FOOD_CRAVINGS: 'les envies alimentaires',
  LIBIDO_CHANGE: 'les changements de libido',
};

function symptomTip(symptom: string, phase: CyclePhase): Tip {
  const label = SYMPTOM_LABELS[symptom] ?? symptom.toLowerCase();
  const phaseLabel = PHASE_LABELS[phase];
  if (symptom === 'FATIGUE' || symptom === 'BACK_PAIN') {
    return {
      icon: Moon,
      iconClassName: 'text-primary',
      bgClassName: 'bg-primary-faint',
      title: 'Priorise le repos',
      body: `${label[0]!.toUpperCase()}${label.slice(1)} revien${label.startsWith('les') ? 'nent' : 't'} souvent pendant ta ${phaseLabel.toLowerCase()}. Assure-toi de dormir suffisamment et de te détendre durant cette période.`,
    };
  }
  if (symptom === 'BLOATING' || symptom === 'NAUSEA' || symptom === 'CONSTIPATION') {
    return {
      icon: Droplet,
      iconClassName: 'text-rose',
      bgClassName: 'bg-rose-soft',
      title: 'Reste bien hydratée',
      body: `Tes données montrent une fréquence élevée de ${label} durant ta ${phaseLabel.toLowerCase()}. Augmente ta consommation d'eau, cela peut aider.`,
    };
  }
  return {
    icon: Activity,
    iconClassName: 'text-primary',
    bgClassName: 'bg-primary-faint',
    title: 'Observe ce schéma',
    body: `${label[0]!.toUpperCase()}${label.slice(1)} revien${label.startsWith('les') ? 'nent' : 't'} souvent pendant ta ${phaseLabel.toLowerCase()}. Continue à noter tes ressentis pour mieux comprendre ce schéma.`,
  };
}

export function AnalyticsRecommendations({
  cycleVariability,
  topSymptoms,
  moodDistribution,
  eligible,
}: AnalyticsRecommendationsProps): React.JSX.Element {
  const tips: Tip[] = [];

  if (cycleVariability && cycleVariability.label !== 'REGULAR') {
    tips.push({
      icon: Activity,
      iconClassName: 'text-primary',
      bgClassName: 'bg-primary-faint',
      title: 'Continue à enregistrer tes cycles',
      body: 'Tes cycles montrent des variations de durée. Un suivi régulier aide NAWIRA à mieux comprendre tes tendances au fil du temps.',
    });
  }

  if (topSymptoms) {
    const top = topOverallSymptom(topSymptoms);
    if (top && top.frequency >= 0.4) {
      tips.push(symptomTip(top.symptom, top.phase));
    }
  }

  if (moodDistribution) {
    const heavy = moodDistribution.distribution
      .filter((m) => m.mood === 'TIRED' || m.mood === 'STRESSED' || m.mood === 'LOW')
      .reduce((sum, m) => sum + m.percentage, 0);
    if (heavy >= 40) {
      tips.push({
        icon: Moon,
        iconClassName: 'text-primary',
        bgClassName: 'bg-primary-faint',
        title: 'Prends soin de ton bien-être',
        body: 'Ton humeur est souvent basse, stressée ou fatiguée dans tes enregistrements récents. Accorder du temps au repos et à la détente peut aider.',
      });
    }
  }

  if (tips.length === 0) {
    tips.push(...FALLBACK_TIPS);
  }

  const shown = tips.slice(0, 3);

  return (
    <div className="rounded-xl border border-border bg-white p-4 sm:p-6">
      <h2 className="mb-5 flex items-center gap-2 text-base font-bold md:text-lg text-navy">
        <Lightbulb size={18} className="shrink-0 text-amber" />
        Recommandations personnalisées
      </h2>
      <div className="flex flex-col gap-4">
        {shown.map((tip) => (
          <div key={tip.title} className={`rounded-lg border border-border p-4 ${tip.bgClassName}`}>
            <div className="flex items-start gap-3">
              <tip.icon size={18} className={`mt-0.5 shrink-0 ${tip.iconClassName}`} />
              <div className="min-w-0">
                <div className="mb-1 text-sm font-semibold text-navy">{tip.title}</div>
                <p className="text-sm text-muted-foreground">{tip.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-1 rounded-lg bg-gray-50 p-3 text-xs text-muted-foreground">
        <Info size={12} className="mt-0.5 shrink-0" />
        {eligible
          ? 'Ces recommandations sont basées sur ton historique. Elles s’amélioreront avec plus de données.'
          : 'Ces conseils sont généraux. Ils deviendront personnalisés au fil de tes enregistrements.'}
      </div>
    </div>
  );
}
