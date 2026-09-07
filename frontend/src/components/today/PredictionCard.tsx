import { Calendar as CalendarIcon } from 'lucide-react';

interface PredictionSummary {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedPeriodStart: string;
}

interface PredictionCardProps {
  prediction: PredictionSummary | null;
}

const CONFIDENCE_LABELS: Record<PredictionSummary['confidence'], string> = {
  LOW: 'Estimation approximative',
  MEDIUM: 'Estimation modérée',
  HIGH: 'Estimation fiable',
};

function formatFrenchDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function PredictionCard({ prediction }: PredictionCardProps): React.JSX.Element {
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
    <div className="flex items-center gap-4 rounded-xl border border-border bg-white px-5 py-4">
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
  );
}
