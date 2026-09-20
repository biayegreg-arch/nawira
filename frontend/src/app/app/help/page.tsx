'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Info } from 'lucide-react';
import { HELP_CATEGORIES } from '@/lib/help-content';
import { HelpAccordion } from '@/components/help/HelpAccordion';
import { ContactSupportCard } from '@/components/help/ContactSupportCard';
import { staggerDelay } from '@/lib/utils';

export default function HelpCenterPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_CATEGORIES;
    return HELP_CATEGORIES.map((category) => ({
      ...category,
      questions: category.questions.filter(
        (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q),
      ),
    })).filter((category) => category.questions.length > 0);
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:p-8 lg:max-w-none">
      <div className="mb-6 md:mb-8">
        <h1 className="flex items-center gap-3 text-2xl font-bold leading-tight text-navy md:text-3xl">
          <span className="text-2xl md:text-3xl">❓</span>
          Centre d&rsquo;aide
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trouve des réponses à tes questions sur NAWIRA et ta santé féminine.
        </p>
      </div>

      <div className="mb-6 md:mb-8">
        <div className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-gray-50 px-4 py-2">
          <Search size={18} className="shrink-0 text-muted-light" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cherche une réponse…"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-navy outline-none md:text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <h2 className="text-lg font-bold text-navy md:text-xl">Articles et guides</h2>
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category, i) => (
              <div key={category.title} className="animate-fade-in-up" style={staggerDelay(i)}>
                <HelpAccordion category={category} />
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aucun résultat pour cette recherche.</p>
          )}
        </div>

        <div className="animate-fade-in-up flex flex-col gap-6" style={staggerDelay(1)}>
          <ContactSupportCard />

          <div className="rounded-xl border border-border bg-green-soft p-4">
            <div className="flex gap-3">
              <Info size={16} className="mt-0.5 shrink-0 text-green" />
              <div>
                <div className="text-sm font-semibold text-navy">
                  Besoin d&rsquo;aide médicale ?
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  NAWIRA est un outil d&rsquo;information. Pour toute question médicale urgente,
                  consulte un professionnel de santé.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
