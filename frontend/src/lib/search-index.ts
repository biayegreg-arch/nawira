// Client-side global search index for the AppTopBar search bar. No backend
// search endpoint exists (and none is needed): this combines the app's own
// route map with content that already exists elsewhere (help-content.ts's
// real FAQ copy, conception-articles.ts's real article list) so results
// never point to fabricated pages or invented content.
import { HELP_CATEGORIES } from '@/lib/help-content';
import { CONCEPTION_ARTICLES } from '@/components/baby/conception-articles';

export interface SearchResult {
  group: 'Pages' | 'Aide' | 'Projet Bébé';
  title: string;
  subtitle?: string;
  href: string;
}

interface PageEntry {
  title: string;
  href: string;
  keywords: string[];
}

const PAGES: PageEntry[] = [
  { title: "Aujourd'hui", href: '/app/today', keywords: ['accueil', 'dashboard', 'cycle', 'jour'] },
  {
    title: 'Calendrier',
    href: '/app/calendar',
    keywords: ['calendrier', 'règles', 'periode', 'mois'],
  },
  {
    title: 'Ajouter des données',
    href: '/app/log',
    keywords: ['journal', 'symptome', 'humeur', 'log', 'saisie'],
  },
  { title: 'Mes cycles', href: '/app/cycles', keywords: ['cycles', 'historique', 'règles'] },
  { title: 'Analyses', href: '/app/insights', keywords: ['statistiques', 'tendances', 'analyse'] },
  {
    title: 'Projet Bébé',
    href: '/app/baby',
    keywords: ['bebe', 'grossesse', 'conception', 'fertilite'],
  },
  {
    title: 'Fenêtre de fertilité',
    href: '/app/baby/calendar',
    keywords: ['ovulation', 'fertilite', 'ldh', 'test'],
  },
  {
    title: 'Ressources Conception',
    href: '/app/baby/resources',
    keywords: ['articles', 'guides', 'conception'],
  },
  {
    title: 'Conseils Conception',
    href: '/app/baby/tips',
    keywords: ['conseils', 'astuces', 'conception'],
  },
  {
    title: 'Assistant NAWIRA',
    href: '/app/assistant',
    keywords: ['assistant', 'chat', 'ia', 'question'],
  },
  { title: 'Mon profil', href: '/app/profile', keywords: ['profil', 'compte', 'moi'] },
  {
    title: 'Paramètres',
    href: '/app/settings',
    keywords: ['parametres', 'mot de passe', 'google', 'notifications'],
  },
  {
    title: 'Abonnement',
    href: '/app/billing',
    keywords: ['abonnement', 'plus', 'prix', 'paiement', 'facturation'],
  },
  { title: "Centre d'aide", href: '/app/help', keywords: ['aide', 'faq', 'support', 'question'] },
];

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function searchAll(rawQuery: string): SearchResult[] {
  const q = normalize(rawQuery);
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const page of PAGES) {
    const haystack = normalize([page.title, ...page.keywords].join(' '));
    if (haystack.includes(q)) {
      results.push({ group: 'Pages', title: page.title, href: page.href });
    }
  }

  for (const category of HELP_CATEGORIES) {
    for (const item of category.questions) {
      if (normalize(item.q).includes(q) || normalize(item.a).includes(q)) {
        results.push({
          group: 'Aide',
          title: item.q,
          subtitle: category.title,
          href: `/app/help?q=${encodeURIComponent(item.q)}`,
        });
      }
    }
  }

  for (const article of CONCEPTION_ARTICLES) {
    if (normalize(article.title).includes(q) || normalize(article.desc).includes(q)) {
      results.push({
        group: 'Projet Bébé',
        title: article.title,
        subtitle: article.category,
        href: `/app/baby/resources?q=${encodeURIComponent(article.title)}`,
      });
    }
  }

  return results.slice(0, 8);
}
