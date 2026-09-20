import { Info, Heart, Droplet, Activity, Moon, Lightbulb } from 'lucide-react';

interface Tip {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  bg: string;
  color: string;
  title: string;
  body: string;
}

// Real, cautious, non-diagnostic content (no fabricated statistics, no
// guaranteed-outcome claims) — same discipline as help-content.ts's FAQ
// copy. General wellness/fertility-awareness guidance only; anything
// specific to a person's situation is explicitly deferred to a health
// professional.
const TIPS: Tip[] = [
  {
    icon: Heart,
    bg: 'bg-amber-soft',
    color: 'text-rose',
    title: 'Relations intimes régulières',
    body: 'Les rapports réguliers (tous les 2-3 jours) pendant la fenêtre fertile augmentent les chances de conception.',
  },
  {
    icon: Droplet,
    bg: 'bg-green-soft',
    color: 'text-green',
    title: 'Reste bien hydratée',
    body: 'Une bonne hydratation soutient le bon fonctionnement général de ton cycle.',
  },
  {
    icon: Activity,
    bg: 'bg-primary-soft',
    color: 'text-purple',
    title: 'Réduis le stress',
    body: 'Le stress chronique peut influencer la régularité du cycle. Essaie la respiration, la marche ou le yoga.',
  },
  {
    icon: Moon,
    bg: 'bg-rose-soft',
    color: 'text-rose',
    title: 'Dors suffisamment',
    body: '7 à 9 heures de sommeil soutiennent ta fertilité et ton bien-être général.',
  },
  {
    icon: Lightbulb,
    bg: 'bg-primary-soft',
    color: 'text-primary',
    title: 'Acide folique',
    body: 'La prise d’acide folique avant une grossesse est une recommandation courante. Parles-en à un professionnel de santé.',
  },
];

export function ConceptionTipsCard(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-white p-4 sm:p-6">
      <h2 className="mb-5 flex items-center gap-2 text-base font-bold md:text-lg text-navy">
        <Lightbulb size={18} className="text-amber" />
        Conseils pour cette période
      </h2>

      <div className="flex flex-col gap-4">
        {TIPS.map((tip) => (
          <div
            key={tip.title}
            className={`flex gap-3 rounded-lg border border-border p-3 ${tip.bg}`}
          >
            <tip.icon size={18} className={`mt-0.5 shrink-0 ${tip.color}`} />
            <div className="min-w-0">
              <div className={`mb-1 text-sm font-semibold ${tip.color}`}>{tip.title}</div>
              <p className="break-words text-sm text-muted-foreground">{tip.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg bg-green-soft p-4">
        <div className="flex gap-3">
          <Info size={16} className="mt-0.5 shrink-0 text-green" />
          <p className="text-sm text-muted-foreground">
            NAWIRA ne pose pas de diagnostic et ne remplace pas un avis médical. Pour tout
            accompagnement personnalisé sur ton projet bébé, consulte un professionnel de santé.
          </p>
        </div>
      </div>
    </div>
  );
}
