// Real, cautious, non-diagnostic content for /app/baby/tips. General
// fertility-awareness guidance only — no fabricated statistics or
// unverifiable claims of medical endorsement.
export interface ConceptionFullTip {
  category: string;
  categoryColor: string;
  categoryBg: string;
  icon: string;
  title: string;
  desc: string;
  fullContent: string;
  tips: string[];
}

export const CONCEPTION_FULL_TIPS: ConceptionFullTip[] = [
  {
    category: 'Timing',
    categoryColor: 'text-green',
    categoryBg: 'bg-green-soft',
    icon: '⏰',
    title: 'Optimise le timing des rapports',
    desc: 'Les rapports pendant la fenêtre fertile augmentent les chances de conception.',
    fullContent:
      'Les spermatozoïdes peuvent survivre plusieurs jours dans l’appareil reproducteur féminin, donc anticiper l’ovulation aide à couvrir la période la plus propice. NAWIRA t’aide à identifier ta fenêtre fertile estimée.',
    tips: ['Rapports réguliers pendant la fenêtre fertile', 'La régularité prime sur la fréquence'],
  },
  {
    category: 'Santé',
    categoryColor: 'text-primary',
    categoryBg: 'bg-primary-soft',
    icon: '💪',
    title: 'Mets en place des habitudes saines',
    desc: 'Alimentation, sommeil et exercice soutiennent la santé reproductive.',
    fullContent:
      'Un sommeil insuffisant peut affecter l’équilibre hormonal, une alimentation pauvre en nutriments clés peut jouer sur la qualité ovocytaire, et le stress chronique est associé à des perturbations du cycle. Prendre soin de sa santé générale est une base utile.',
    tips: [
      '7 à 9h de sommeil par nuit',
      'Alimentation équilibrée',
      'Activité physique modérée régulière',
    ],
  },
  {
    category: 'Alimentation',
    categoryColor: 'text-amber',
    categoryBg: 'bg-amber-soft',
    icon: '🥗',
    title: 'Focus sur une alimentation équilibrée',
    desc: 'Certains nutriments sont associés à une meilleure santé reproductive.',
    fullContent:
      'L’acide folique est couramment recommandé avant une grossesse pour prévenir certaines anomalies. Le fer, le sélénium et les oméga-3 sont aussi souvent cités dans une alimentation favorable à la fertilité. Un professionnel de santé peut t’orienter sur une supplémentation adaptée.',
    tips: ['Légumes verts feuillus (folate)', 'Poisson gras (oméga-3)', 'Noix et graines'],
  },
  {
    category: 'Stress',
    categoryColor: 'text-rose',
    categoryBg: 'bg-rose-soft',
    icon: '🧘🏾‍♀️',
    title: 'Gère le stress efficacement',
    desc: 'Le stress chronique peut perturber la régularité du cycle.',
    fullContent:
      'Un stress prolongé peut influencer les hormones impliquées dans l’ovulation, ce qui peut allonger ou perturber le cycle. Des pratiques de gestion du stress peuvent aider au bien-être général pendant cette période.',
    tips: [
      'Méditation ou respiration guidée',
      'Yoga ou marche régulière',
      'Accompagnement psychologique si besoin',
    ],
  },
  {
    category: 'Hormones',
    categoryColor: 'text-rose',
    categoryBg: 'bg-rose-soft',
    icon: '🔬',
    title: 'Comprends tes hormones',
    desc: 'La LH et l’ovulation sont liées — NAWIRA t’aide à les suivre.',
    fullContent:
      'Le pic de l’hormone lutéinisante (LH) précède généralement l’ovulation de 24 à 36 heures. Suivre ce signal via un test LH, en complément des données NAWIRA, peut t’aider à mieux cerner ta fenêtre fertile.',
    tips: [
      'Suivre les pics de LH',
      'Observer les autres signes (glaire, température)',
      'Surveiller la longueur du cycle',
    ],
  },
  {
    category: 'Suivi',
    categoryColor: 'text-primary',
    categoryBg: 'bg-primary-soft',
    icon: '📊',
    title: 'Suivi régulier avec NAWIRA',
    desc: 'Les données quotidiennes affinent les prédictions au fil du temps.',
    fullContent:
      'Plus tu enregistres de données (règles, tests LH, température, symptômes), plus les estimations de NAWIRA peuvent s’affiner pour ton cycle personnel.',
    tips: ['Saisie quotidienne de données', 'Tests LH réguliers', 'Suivi sur plusieurs cycles'],
  },
];
