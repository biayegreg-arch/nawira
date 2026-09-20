import Link from 'next/link';
import { Check } from 'lucide-react';
import { ProjetBebeBreadcrumb } from '@/components/baby/ProjetBebeBreadcrumb';
import { CONCEPTION_FULL_TIPS } from '@/components/baby/conception-tips-full';
import { staggerDelay } from '@/lib/utils';

export default function ConceptionTipsPage(): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:p-8 lg:max-w-none">
      <ProjetBebeBreadcrumb current="Conseils Conception" />
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-3 text-2xl font-bold leading-tight text-navy md:text-3xl">
          <span className="text-2xl md:text-3xl">💡</span>
          Conseils pour maximiser tes chances
        </h1>
        <p className="text-sm text-muted-foreground">
          Des pistes générales adaptées à ton projet de conception.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-primary-soft p-4 sm:p-6">
        <p className="mb-3 text-sm leading-relaxed text-navy md:text-base">
          La conception dépend de multiples facteurs — timing, santé générale, alimentation et
          gestion du stress. Ces conseils sont des repères généraux, pas un plan personnalisé.
        </p>
        <span className="inline-block rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-navy">
          Contenu de sensibilisation, pas un avis médical
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {CONCEPTION_FULL_TIPS.map((tip, i) => (
          <div
            key={tip.title}
            className="animate-fade-in-up flex flex-col gap-4 min-w-0 rounded-xl border border-border bg-white p-4 transition-shadow sm:p-6 duration-200 hover:shadow-sm"
            style={staggerDelay(i)}
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 text-2xl md:text-3xl">{tip.icon}</span>
              <div className="min-w-0 flex-1">
                <span
                  className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tip.categoryBg} ${tip.categoryColor}`}
                >
                  {tip.category}
                </span>
                <h3 className="mb-1 break-words text-base font-bold text-navy">{tip.title}</h3>
                <p className="mb-3 break-words text-sm leading-relaxed text-muted-foreground">
                  {tip.desc}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-gray-50 p-4">
              <p className="mb-3 break-words text-sm leading-relaxed text-navy">
                {tip.fullContent}
              </p>
              <div className="flex flex-col gap-2">
                {tip.tips.map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <Check size={12} className="mt-0.5 shrink-0 text-green" />
                    <span className="min-w-0 break-words text-sm text-navy">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-green-soft/40 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-navy">
              <span>👑</span>
              Conseils IA personnalisés avec NAWIRA Plus
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Reçois des recommandations adaptées à ton cycle et à ton historique.
            </p>
            <Link
              href="/app/billing"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-green px-4 py-2.5 text-sm font-semibold text-white sm:w-auto"
            >
              Explorer NAWIRA Plus
            </Link>
          </div>
          <span className="shrink-0 text-3xl md:text-4xl">🤖</span>
        </div>
      </div>
    </div>
  );
}
