import { formatFrenchDate } from '@/lib/format-date';

interface CycleListItemProps {
  startDate: string;
  endDate: string | null;
  length: number | null;
  isOutlier: boolean;
}

export function CycleListItem({
  startDate,
  endDate,
  length,
  isOutlier,
}: CycleListItemProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3 transition-shadow duration-200 hover:shadow-sm">
      <div>
        <div className="text-sm font-medium text-navy">
          {formatFrenchDate(startDate)} — {endDate ? formatFrenchDate(endDate) : 'en cours'}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {length ? `${length} jours` : 'Durée pas encore connue'}
        </div>
      </div>
      {isOutlier && (
        <span className="shrink-0 rounded-full bg-amber-soft px-2 py-1 text-xs font-medium text-amber">
          Atypique
        </span>
      )}
    </div>
  );
}
