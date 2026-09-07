import { Info, Sparkles } from 'lucide-react';

interface Tip {
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
    title: 'Suis ta fenêtre fertile',
    body: 'Les rapports pendant la fenêtre fertile estimée augmentent les chances de conception. C’est une estimation basée sur ton historique de cycle, pas une certitude — elle s’affine au fil des cycles suivis.',
  },
  {
    title: 'Acide folique',
    body: 'La prise d’acide folique avant une grossesse est une recommandation courante. Parles-en à un professionnel de santé pour un dosage adapté à ta situation.',
  },
  {
    title: 'Hygiène de vie',
    body: 'Une alimentation équilibrée, une activité physique régulière et un sommeil suffisant soutiennent le bon fonctionnement du cycle.',
  },
  {
    title: 'Alcool et tabac',
    body: 'Réduire ou arrêter l’alcool et le tabac est généralement recommandé en période de conception. Un professionnel de santé peut t’accompagner dans cette démarche.',
  },
  {
    title: 'Stress',
    body: 'Le stress chronique peut influencer la régularité du cycle. Des pratiques de relaxation (respiration, marche, sommeil régulier) peuvent aider.',
  },
];

export function ConceptionTipsCard(): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-soft text-rose">
          <Sparkles size={18} />
        </div>
        <h2 className="text-lg font-bold text-navy">Conseils</h2>
      </div>

      <ul className="flex flex-col gap-4">
        {TIPS.map((tip) => (
          <li key={tip.title}>
            <div className="text-sm font-semibold text-navy">{tip.title}</div>
            <p className="mt-0.5 text-sm text-muted-foreground">{tip.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-lg bg-green-soft p-4">
        <div className="flex gap-3">
          <Info size={16} className="mt-0.5 shrink-0 text-green" />
          <p className="text-xs text-muted-foreground">
            NAWIRA ne pose pas de diagnostic et ne remplace pas un avis médical. Pour tout
            accompagnement personnalisé sur ton projet bébé, consulte un professionnel de santé.
          </p>
        </div>
      </div>
    </div>
  );
}
