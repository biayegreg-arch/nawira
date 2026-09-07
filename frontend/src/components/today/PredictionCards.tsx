import Link from 'next/link';
import { Calendar as CalendarIcon, Sun, Leaf, ChevronRight } from 'lucide-react';
import { formatFrenchDate } from '@/lib/format-date';

interface PredictionSummary {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedPeriodStart: string;
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
  ovulationEstimate: string | null;
}

interface PredictionCardsProps {
  prediction: PredictionSummary | null;
  hasCycles: boolean;
  today: string;
}

const CONFIDENCE_LABELS: Record<PredictionSummary['confidence'], string> = {
  LOW: 'Estimation approximative',
  MEDIUM: 'Estimation modérée',
  HIGH: 'Estimation fiable',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY);
}

export function PredictionCards({
  prediction,
  hasCycles,
  today,
}: PredictionCardsProps): React.JSX.Element {
  if (!prediction) {
    return (
      <div className="rounded-lg border border-border bg-white p-5">
        <p className="text-sm text-muted-foreground">
          Continue à suivre ton cycle pour une première estimation de tes prochaines règles.
        </p>
      </div>
    );
  }

  const daysToPeriod = daysUntil(today, prediction.expectedPeriodStart);
  const inFertileWindow =
    prediction.fertileWindowStart &&
    prediction.fertileWindowEnd &&
    today >= prediction.fertileWindowStart &&
    today <= prediction.fertileWindowEnd;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 rounded-lg border border-border bg-white px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-soft text-rose">
          <CalendarIcon size={18} />
        </div>
        <div className="flex-1">
          <div className="mb-0.5 text-xs text-muted-foreground">Prochaines règles</div>
          <div className="text-xl leading-tight font-bold text-navy">
            {daysToPeriod >= 0
              ? `≈ ${daysToPeriod} jours`
              : formatFrenchDate(prediction.expectedPeriodStart)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatFrenchDate(prediction.expectedPeriodStart)}
          </div>
        </div>
      </div>

      {prediction.ovulationEstimate && (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-white px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-soft text-amber">
            <Sun size={18} />
          </div>
          <div className="flex-1">
            <div className="mb-0.5 text-xs text-muted-foreground">Ovulation estimée</div>
            <div className="text-xl leading-tight font-bold text-navy">
              ≈ {formatFrenchDate(prediction.ovulationEstimate)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {CONFIDENCE_LABELS[prediction.confidence]}
            </div>
          </div>
        </div>
      )}

      {prediction.fertileWindowStart && prediction.fertileWindowEnd && (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-white px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-soft text-green">
            <Leaf size={18} />
          </div>
          <div className="flex-1">
            <div className="mb-0.5 text-xs text-muted-foreground">Fenêtre fertile</div>
            <div className="text-base leading-tight font-bold text-navy">
              {formatFrenchDate(prediction.fertileWindowStart)} –{' '}
              {formatFrenchDate(prediction.fertileWindowEnd)}
            </div>
            {inFertileWindow && (
              <span className="mt-1 inline-block rounded-full bg-green-soft px-2 py-0.5 text-xs font-semibold text-green">
                En cours
              </span>
            )}
          </div>
        </div>
      )}

      {hasCycles && (
        <Link
          href="/app/cycles"
          className="flex items-center justify-between rounded-lg border border-border bg-white px-5 py-3 text-xs font-medium text-primary"
        >
          Voir l&rsquo;historique de mes cycles
          <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}
