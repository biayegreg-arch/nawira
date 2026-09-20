import Link from 'next/link';
import { Droplet, Plus } from 'lucide-react';

const LH_LABELS: Record<string, string> = {
  NEGATIVE: 'Négatif',
  POSITIVE: 'Positif',
  PEAK: 'Pic',
  INCONCLUSIVE: 'Non concluant',
};

// Real physiological guidance (LH surge precedes ovulation by ~24-36h) and
// honest non-claims for the other results — no fabricated numbers.
const LH_STATUS: Record<string, { badge: string; badgeClass: string; note: string | null }> = {
  PEAK: {
    badge: 'Pic positif',
    badgeClass: 'bg-amber-soft text-amber',
    note: "L'ovulation arrive généralement 24 à 36 heures après un pic de LH.",
  },
  POSITIVE: {
    badge: 'Positif',
    badgeClass: 'bg-amber-soft text-amber',
    note: 'Un pic pourrait suivre dans les prochains jours — continue à tester.',
  },
  NEGATIVE: {
    badge: 'Négatif',
    badgeClass: 'bg-gray-100 text-muted-foreground',
    note: null,
  },
  INCONCLUSIVE: {
    badge: 'Non concluant',
    badgeClass: 'bg-gray-100 text-muted-foreground',
    note: 'Réessaie plus tard dans la journée avec un nouveau test.',
  },
};

export interface RecentLhEntry {
  date: string;
  lhResult: string;
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(iso));
}

interface LHTestTrackerProps {
  todayResult: string | null;
  recentEntries: RecentLhEntry[];
}

export function LHTestTracker({
  todayResult,
  recentEntries,
}: LHTestTrackerProps): React.JSX.Element {
  const status = todayResult ? LH_STATUS[todayResult] : null;

  return (
    <div className="rounded-lg border border-border bg-white p-4 sm:p-6">
      <h2 className="mb-5 text-base font-bold md:text-lg text-navy">Suivi des tests LH</h2>

      <div className="mb-5 flex flex-col gap-3">
        {status && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-green-soft/40 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber text-white">
              <Droplet size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-navy">Aujourd&rsquo;hui</div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${status.badgeClass}`}
                >
                  {status.badge}
                </span>
              </div>
              {status.note && (
                <p className="mt-1 break-words text-sm text-muted-foreground">{status.note}</p>
              )}
            </div>
          </div>
        )}

        {recentEntries.map((entry) => (
          <div
            key={entry.date}
            className="flex items-start gap-3 rounded-lg border border-border p-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Droplet size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-navy">{shortDate(entry.date)}</div>
                <span className="text-sm text-muted-foreground">
                  {LH_LABELS[entry.lhResult] ?? entry.lhResult}
                </span>
              </div>
            </div>
          </div>
        ))}

        {!status && recentEntries.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun test enregistré pour le moment.</p>
        )}
      </div>

      <Link
        href="/app/baby/add-lh-test"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary-soft px-4 py-2.5 text-sm font-semibold text-primary"
      >
        <Plus size={14} />
        Ajouter un test
      </Link>
    </div>
  );
}
