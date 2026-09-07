import { Lightbulb, Info } from 'lucide-react';

const TIPS = [
  {
    icon: '🌡️',
    title: 'Enregistre ta température',
    desc: 'Tous les matins à la même heure pour détecter l’ovulation.',
  },
  {
    icon: '📝',
    title: 'Note tes symptômes',
    desc: 'Glaires cervicales, douleurs, énergie. Plus tu notes, mieux NAWIRA prédira.',
  },
  {
    icon: '📅',
    title: 'Sois régulière',
    desc: 'Les données quotidiennes affinent tes prédictions chaque mois.',
  },
];

export function FertilityCalendarInfo(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-white p-6">
      <h3 className="flex items-center gap-2 text-sm font-bold text-navy">
        <Lightbulb size={16} className="text-amber" />
        Conseils pour optimiser le suivi
      </h3>

      <div className="flex flex-col gap-3">
        {TIPS.map((tip) => (
          <div key={tip.title} className="rounded-lg border border-border bg-gray-50 p-3">
            <div className="flex gap-3">
              <span className="shrink-0 text-lg">{tip.icon}</span>
              <div>
                <div className="text-xs font-semibold text-navy">{tip.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{tip.desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-amber-soft p-4">
        <div className="flex items-start gap-3">
          <Info size={16} className="mt-0.5 shrink-0 text-amber" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-navy">Conseil :</strong> le jour de l&rsquo;ovulation est une
            estimation. Couple les données de NAWIRA avec un test LH pour plus de précision.
          </p>
        </div>
      </div>
    </div>
  );
}
