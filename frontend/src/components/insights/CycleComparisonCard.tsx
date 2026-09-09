import Link from 'next/link';
import { Calendar, Info } from 'lucide-react';

export interface CycleComparisonData {
  current: {
    daysElapsed: number;
    periodLengthSoFar: number | null;
    symptomCount: number;
    avgCycleScore: number | null;
  } | null;
  previous: {
    length: number;
    periodLength: number | null;
    symptomCount: number;
    avgCycleScore: number | null;
  };
}

interface CycleComparisonCardProps {
  cycleComparison: CycleComparisonData | null;
}

function previousDetail(previous: CycleComparisonData['previous']): string {
  const parts: string[] = [];
  if (previous.periodLength !== null) parts.push(`Règles : ${previous.periodLength} jours`);
  parts.push(`${previous.symptomCount} symptôme${previous.symptomCount !== 1 ? 's' : ''}`);
  if (previous.avgCycleScore !== null) parts.push(`Score moyen : ${previous.avgCycleScore}/100`);
  return parts.join(' · ');
}

function currentDetail(current: NonNullable<CycleComparisonData['current']>): string {
  const parts: string[] = [];
  if (current.periodLengthSoFar !== null) {
    parts.push(`Règles : ${current.periodLengthSoFar} jours`);
  }
  parts.push(`${current.symptomCount} symptôme${current.symptomCount !== 1 ? 's' : ''}`);
  if (current.avgCycleScore !== null) parts.push(`Score moyen : ${current.avgCycleScore}/100`);
  return parts.join(' · ');
}

export function CycleComparisonCard({
  cycleComparison,
}: CycleComparisonCardProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <h2 className="mb-5 text-lg font-bold text-navy">Comparaison des cycles</h2>

      {!cycleComparison ? (
        <p className="text-xs text-muted-foreground">
          Pas encore assez de cycles complétés pour comparer.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {cycleComparison.current && (
            <div className="pb-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-navy">Cycle actuel</span>
                <span className="rounded-full bg-amber-soft px-2 py-1 text-xs font-medium text-amber">
                  En cours (Jour {cycleComparison.current.daysElapsed})
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info size={12} className="shrink-0" />
                {currentDetail(cycleComparison.current)}
              </div>
            </div>
          )}
          <div className={cycleComparison.current ? 'border-t border-border pt-4' : ''}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-navy">Cycle précédent</span>
              <span className="rounded-full bg-primary-soft px-2 py-1 text-xs font-medium text-primary">
                {cycleComparison.previous.length} jours
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar size={12} className="shrink-0" />
              {previousDetail(cycleComparison.previous)}
            </div>
          </div>
        </div>
      )}

      <Link
        href="/app/cycles"
        className="mt-5 block w-full rounded-md border border-border bg-gray-50 py-2.5 px-4 text-center text-sm font-medium text-navy"
      >
        Voir tous les cycles
      </Link>
    </div>
  );
}
