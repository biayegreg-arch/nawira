'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Mail, Info } from 'lucide-react';
import { HELP_CATEGORIES } from '@/lib/help-content';
import { HelpAccordion } from '@/components/help/HelpAccordion';

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
    <div className="p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-navy">
          <span className="text-3xl">❓</span>
          Centre d&rsquo;aide
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trouve des réponses à tes questions sur NAWIRA et ta santé féminine.
        </p>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-gray-50 px-4 py-3">
          <Search size={18} className="text-muted-light" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cherche une réponse…"
            className="flex-1 bg-transparent text-sm text-navy outline-none"
          />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <h2 className="text-lg font-bold text-navy">Articles et guides</h2>
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => (
              <HelpAccordion key={category.title} category={category} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aucun résultat pour cette recherche.</p>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-border bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy">
              <Mail size={18} className="text-primary" />
              Contacte notre équipe
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Tu n&rsquo;as pas trouvé la réponse ? Écris-nous, on te répond par email.
            </p>
            <a
              href="mailto:support@nawira.app"
              className="flex items-center justify-between rounded-lg border border-border bg-gray-50 p-3"
            >
              <span className="text-sm font-medium text-navy">support@nawira.app</span>
            </a>
          </div>

          <div className="rounded-xl border border-border bg-green-soft p-4">
            <div className="flex gap-3">
              <Info size={16} className="mt-0.5 shrink-0 text-green" />
              <div>
                <div className="text-sm font-semibold text-navy">
                  Besoin d&rsquo;aide médicale ?
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
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
