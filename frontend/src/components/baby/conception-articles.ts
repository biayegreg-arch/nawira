// Real, cautious, non-diagnostic informational content — same discipline as
// help-content.ts's FAQ copy and ConceptionTipsCard. No fabricated expert
// endorsements, no invented statistics.
export interface ConceptionArticle {
  category: string;
  categoryColor: string;
  categoryBg: string;
  icon: string;
  title: string;
  desc: string;
  readTime: string;
}

export const CONCEPTION_ARTICLES: ConceptionArticle[] = [
  {
    category: 'Conception',
    categoryColor: 'text-green',
    categoryBg: 'bg-green-soft',
    icon: '🌿',
    title: 'Comprendre ta fenêtre fertile',
    desc: 'Tout savoir sur les 5 à 6 jours les plus propices à la conception chaque mois.',
    readTime: '5 min',
  },
  {
    category: 'Santé',
    categoryColor: 'text-primary',
    categoryBg: 'bg-primary-soft',
    icon: '💊',
    title: 'Acide folique et préconception',
    desc: 'Pourquoi une supplémentation avant la conception est une recommandation courante.',
    readTime: '4 min',
  },
  {
    category: 'Alimentation',
    categoryColor: 'text-amber',
    categoryBg: 'bg-amber-soft',
    icon: '🥗',
    title: 'Alimentation et fertilité',
    desc: 'Les grandes lignes d’une alimentation équilibrée pour soutenir ta fertilité.',
    readTime: '7 min',
  },
  {
    category: 'Bien-être',
    categoryColor: 'text-rose',
    categoryBg: 'bg-rose-soft',
    icon: '🧘🏾‍♀️',
    title: 'Stress et fertilité : le lien méconnu',
    desc: 'Comment le stress chronique peut influencer l’ovulation, et des pistes pour le réduire.',
    readTime: '6 min',
  },
  {
    category: 'Tests',
    categoryColor: 'text-rose',
    categoryBg: 'bg-rose-soft',
    icon: '🩺',
    title: 'Tests LH : quand et comment les utiliser',
    desc: 'Guide pratique pour lire les tests d’ovulation et les coupler avec NAWIRA.',
    readTime: '5 min',
  },
  {
    category: 'Cycle',
    categoryColor: 'text-primary',
    categoryBg: 'bg-primary-soft',
    icon: '🔄',
    title: 'Cycles irréguliers et conception',
    desc: 'Ce qu’un cycle irrégulier change pour estimer ta fenêtre fertile.',
    readTime: '8 min',
  },
];

export const CONCEPTION_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Quand suis-je la plus fertile dans mon cycle ?',
    a: 'La fenêtre fertile couvre généralement 5 à 6 jours : les jours précédant l’ovulation et le jour de l’ovulation lui-même.',
  },
  {
    q: 'Combien de temps faut-il pour tomber enceinte ?',
    a: 'Pour la plupart des couples, cela prend de 3 à 12 mois. Un avis médical est recommandé au-delà d’un an d’essais.',
  },
  {
    q: 'NAWIRA peut-il remplacer un suivi médical ?',
    a: 'Non. NAWIRA est un outil de suivi et d’information, pas un dispositif médical. Consulte toujours un professionnel de santé.',
  },
];
