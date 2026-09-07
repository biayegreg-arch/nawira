const TIPS = [
  {
    title: 'Hydrate-toi suffisamment !',
    body: 'Une bonne hydratation aide à réduire les ballonnements, soutient ta peau et ton énergie.',
  },
  {
    title: 'Bouge un peu chaque jour',
    body: 'Une activité physique douce (marche, étirements) peut aider à réguler ton humeur et ton sommeil.',
  },
  {
    title: 'Priorise ton sommeil',
    body: '7 à 9 heures de sommeil aident ton corps à mieux réguler tes hormones.',
  },
  {
    title: 'Note tes ressentis',
    body: 'Suivre régulièrement tes symptômes aide NAWIRA à mieux comprendre ton cycle au fil du temps.',
  },
  {
    title: 'Prends un moment pour toi',
    body: 'Quelques minutes de calme (respiration, lecture) peuvent aider à réduire le stress quotidien.',
  },
  {
    title: 'Mange équilibré',
    body: 'Une alimentation variée et riche en fibres soutient ton énergie tout au long du cycle.',
  },
  {
    title: 'Écoute ton corps',
    body: 'La fatigue ou les douleurs sont des signaux normaux — accorde-toi du repos quand tu en as besoin.',
  },
];

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export function DailyTip(): React.JSX.Element {
  const tip = TIPS[dayOfYear(new Date()) % TIPS.length]!;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-primary-faint p-5">
      <div className="absolute top-2 right-4 h-20 w-20 rounded-full bg-primary-light opacity-30" />
      <div className="relative z-10">
        <div className="mb-1 text-xs font-semibold text-primary">Conseil du jour</div>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-2xl">💡</div>
          <div>
            <div className="mb-1 text-base font-bold text-navy">{tip.title}</div>
            <div className="text-sm leading-relaxed text-body">{tip.body}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
