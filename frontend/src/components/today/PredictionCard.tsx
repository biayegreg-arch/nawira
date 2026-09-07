import Link from 'next/link';
import { Calendar as CalendarIcon, ChevronRight } from 'lucide-react';
import { formatFrenchDate } from '@/lib/format-date';

interface PredictionSummary {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedPeriodStart: string;
}

interface PredictionCardProps {
  prediction: PredictionSummary | null;
  hasCycles: boolean;
}

const CONFIDENCE_LABELS: Record<PredictionSummary['confidence'], string> = {
  LOW: 'Estimation approximative',
  MEDIUM: 'Estimation modérée',
  HIGH: 'Estimation fiable',
};

export function PredictionCard({ prediction, hasCycles }: PredictionCardProps): React.JSX.Element {
  if (!prediction) {
    return (
      <div className="rounded-xl border border-border bg-white p-5">
        <p className="text-sm text-muted-foreground">
          Continue à suivre ton cycle pour une première estimation de tes prochaines règles.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-white px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-soft text-rose">
          <CalendarIcon size={18} />
        </div>
        <div className="flex-1">
          <div className="mb-0.5 text-xs text-muted-foreground">Prochaines règles</div>
          <div className="text-xl font-bold text-navy">
            {formatFrenchDate(prediction.expectedPeriodStart)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {CONFIDENCE_LABELS[prediction.confidence]}
          </div>
        </div>
      </div>
      {hasCycles && (
        <Link
          href="/app/cycles"
          className="flex items-center justify-between border-t border-border pt-3 text-xs font-medium text-primary"
        >
          Voir l&rsquo;historique de mes cycles
          <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}
