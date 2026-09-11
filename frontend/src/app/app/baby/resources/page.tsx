'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, Clock, ArrowRight, HelpCircle, Info } from 'lucide-react';
import { ProjetBebeTabs } from '@/components/baby/ProjetBebeTabs';
import { CONCEPTION_ARTICLES, CONCEPTION_FAQS } from '@/components/baby/conception-articles';
import { staggerDelay } from '@/lib/utils';

const FILTERS = ['Tous', 'Conception', 'Santé', 'Alimentation', 'Bien-être', 'Tests', 'Cycle'];

export default function ProjetBebeResourcesPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [filter, setFilter] = useState('Tous');

  const articles = useMemo(() => {
    return CONCEPTION_ARTICLES.filter((a) => {
      const matchesFilter = filter === 'Tous' || a.category === filter;
      const matchesQuery =
        query.trim() === '' ||
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.desc.toLowerCase().includes(query.toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [query, filter]);

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-navy">
          <span className="text-3xl">📚</span>
          Ressources Conception
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Articles, guides et conseils pour accompagner ton parcours.
        </p>
      </div>

      <ProjetBebeTabs active="ressources" />

      <div className="grid gap-6 lg:grid-cols-[1fr_288px]">
        <div>
          <div className="mb-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5">
              <Search size={15} className="shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un article…"
                className="w-full text-sm text-navy outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={
                    f === filter
                      ? 'rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all duration-150 active:scale-95'
                      : 'rounded-full border border-border bg-gray-50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-150 active:scale-95'
                  }
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {articles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun article ne correspond à ta recherche.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {articles.map((article, i) => (
                <div
                  key={article.title}
                  className="animate-fade-in-up flex flex-col gap-3 rounded-xl border border-border bg-white p-5 transition-shadow duration-200 hover:shadow-sm"
                  style={staggerDelay(i)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{article.icon}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${article.categoryBg} ${article.categoryColor}`}
                    >
                      {article.category}
                    </span>
                  </div>
                  <div>
                    <h3 className="mb-1 text-sm font-bold leading-snug text-navy">
                      {article.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">{article.desc}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={12} />
                      {article.readTime}
                    </span>
                    <Link
                      href="/app/baby/tips"
                      className="flex items-center gap-1 text-xs font-medium text-primary"
                    >
                      Lire <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-primary-soft p-5">
            <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-primary">
              <Info size={12} />
              Bon à savoir
            </div>
            <p className="text-xs leading-relaxed text-navy">
              Ce contenu est une ressource de sensibilisation générale, pas un avis médical
              personnalisé. Pour toute question sur ta situation, consulte un professionnel de
              santé.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-navy">
              <HelpCircle size={15} className="text-primary" />
              Questions fréquentes
            </h3>
            <div className="flex flex-col gap-4">
              {CONCEPTION_FAQS.map((faq) => (
                <div key={faq.q} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="mb-1 text-xs font-semibold text-navy">{faq.q}</div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-green-soft/40 p-5">
            <div className="mb-2 flex items-center gap-2">
              <span>👑</span>
              <span className="text-sm font-bold text-green">NAWIRA Plus</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Accède à des guides exclusifs et des ressources avancées.
            </p>
            <Link
              href="/app/billing"
              className="block w-full rounded-lg bg-green py-2.5 text-center text-xs font-semibold text-white"
            >
              Découvrir NAWIRA Plus
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
