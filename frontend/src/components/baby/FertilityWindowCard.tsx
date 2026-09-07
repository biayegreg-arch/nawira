import { Leaf } from 'lucide-react';
import { formatFrenchDate } from '@/lib/format-date';

interface FertilityWindowPrediction {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
}

interface FertilityWindowCardProps {
  prediction: FertilityWindowPrediction | null;
}

const CONFIDENCE_LABELS: Record<FertilityWindowPrediction['confidence'], string> = {
  LOW: 'Estimation approximative',
  MEDIUM: 'Estimation modérée',
  HIGH: 'Estimation fiable',
};

export function FertilityWindowCard({ prediction }: FertilityWindowCardProps): React.JSX.Element {
  const hasWindow = prediction?.fertileWindowStart && prediction.fertileWindowEnd;

  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-soft text-green">
          <Leaf size={18} />
        </div>
        <h2 className="text-lg font-bold text-navy">Fenêtre fertile</h2>
      </div>

      {!hasWindow || !prediction ? (
        <p className="text-sm text-muted-foreground">
          Continue à suivre ton cycle pour obtenir une première estimation de ta fenêtre fertile.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Ta fenêtre fertile estimée se situe entre le{' '}
            <span className="font-semibold text-navy">
              {formatFrenchDate(prediction.fertileWindowStart!)}
            </span>{' '}
            et le{' '}
            <span className="font-semibold text-navy">
              {formatFrenchDate(prediction.fertileWindowEnd!)}
            </span>
            .
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {CONFIDENCE_LABELS[prediction.confidence]} — cette plage est une estimation, pas une
            date certaine. L&rsquo;ovulation peut survenir à n&rsquo;importe quel moment à
            l&rsquo;intérieur de cette fenêtre.
          </p>
        </>
      )}
    </div>
  );
}
