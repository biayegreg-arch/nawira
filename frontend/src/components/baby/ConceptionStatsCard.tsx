import { Activity } from 'lucide-react';

interface ConceptionStatsCardProps {
  currentDay: number | null;
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
  today: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY);
}

export function ConceptionStatsCard({
  currentDay,
  fertileWindowStart,
  fertileWindowEnd,
  today,
}: ConceptionStatsCardProps): React.JSX.Element {
  let windowStatus = '—';
  if (fertileWindowStart && fertileWindowEnd) {
    const daysToStart = daysBetween(today, fertileWindowStart);
    const daysToEnd = daysBetween(today, fertileWindowEnd);
    if (daysToStart > 0) {
      windowStatus = `Dans ${daysToStart} jour${daysToStart > 1 ? 's' : ''}`;
    } else if (daysToEnd >= 0) {
      windowStatus = 'En cours';
    } else {
      windowStatus = 'Terminée';
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Activity size={18} />
        </div>
        <h2 className="text-lg font-bold text-navy">Statistiques</h2>
      </div>
      <dl className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <dt className="text-sm text-muted-foreground">Jour du cycle</dt>
          <dd className="text-sm font-semibold text-navy">
            {currentDay !== null ? `Jour ${currentDay}` : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-muted-foreground">Fenêtre fertile</dt>
          <dd className="text-sm font-semibold text-navy">{windowStatus}</dd>
        </div>
      </dl>
    </div>
  );
}
