import Link from 'next/link';
import { formatFrenchDate } from '@/lib/format-date';
import { staggerDelay } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

interface FertilityWindowPrediction {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
  ovulationEstimate: string | null;
}

interface FertilityWindowCardProps {
  prediction: FertilityWindowPrediction | null;
  today: string;
}

const CONFIDENCE_LABELS: Record<FertilityWindowPrediction['confidence'], string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: 'Élevée',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY);
}

export function FertilityWindowCard({
  prediction,
  today,
}: FertilityWindowCardProps): React.JSX.Element {
  const hasWindow = prediction?.fertileWindowStart && prediction.fertileWindowEnd;
  const windowLengthDays =
    hasWindow && prediction
      ? daysBetween(prediction.fertileWindowStart!, prediction.fertileWindowEnd!) + 1
      : null;
  const inFertileWindow =
    hasWindow &&
    prediction &&
    today >= prediction.fertileWindowStart! &&
    today <= prediction.fertileWindowEnd!;

  return (
    <div className="rounded-lg border border-border bg-white p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        <span className="shrink-0 text-2xl">🌿</span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-navy md:text-xl">Fenêtre fertile</h2>
          <p className="text-sm text-muted-foreground">Ton meilleur moment pour concevoir</p>
        </div>
      </div>

      {!hasWindow || !prediction ? (
        <p className="text-sm text-muted-foreground">
          Continue à suivre ton cycle pour obtenir une première estimation de ta fenêtre fertile.
        </p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div
              className="animate-fade-in-up rounded-lg bg-green-soft p-4"
              style={staggerDelay(0)}
            >
              <div className="mb-1 text-xs text-muted-foreground">Fenêtre fertile</div>
              <div className="break-words text-lg font-bold text-navy">
                {formatFrenchDate(prediction.fertileWindowStart!)} –{' '}
                {formatFrenchDate(prediction.fertileWindowEnd!)}
              </div>
              <div className="mt-1 text-xs text-green">
                {windowLengthDays !== null && (
                  <AnimatedNumber value={windowLengthDays} suffix=" jours" />
                )}
              </div>
            </div>
            <div
              className="animate-fade-in-up rounded-lg bg-amber-soft p-4"
              style={staggerDelay(1)}
            >
              <div className="mb-1 text-xs text-muted-foreground">Ovulation</div>
              <div className="text-lg font-bold text-navy">
                {prediction.ovulationEstimate
                  ? `≈ ${formatFrenchDate(prediction.ovulationEstimate)}`
                  : '—'}
              </div>
              <div className="mt-1 text-xs text-amber">Estimation</div>
            </div>
            <div
              className="animate-fade-in-up rounded-lg bg-primary-soft p-4"
              style={staggerDelay(2)}
            >
              <div className="mb-1 text-xs text-muted-foreground">Confiance</div>
              <div className="text-lg font-bold text-primary">
                {CONFIDENCE_LABELS[prediction.confidence]}
              </div>
            </div>
          </div>

          <div className="mb-5 rounded-lg bg-green-soft/40 p-4">
            <p className="text-sm leading-relaxed text-navy">
              {inFertileWindow
                ? 'Tu es actuellement dans ta fenêtre fertile estimée. C’est la période du cycle où la probabilité de conception est la plus élevée.'
                : 'Cette fenêtre est une estimation, pas une date certaine — elle s’affine au fil des cycles suivis.'}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/app/baby/add-lh-test"
              className="flex min-h-11 flex-1 items-center justify-center rounded-md bg-green px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              Ajouter un test LH
            </Link>
            <Link
              href="/app/baby/tips"
              className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-border bg-gray-50 px-4 py-2.5 text-center text-sm font-semibold text-body"
            >
              Voir les conseils
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
