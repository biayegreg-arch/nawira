import { CheckCircle2, AlertCircle } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

export interface CycleVariabilityData {
  stddev: number;
  label: 'REGULAR' | 'SOMEWHAT_VARIABLE' | 'IRREGULAR';
}

export interface AvgCycleLengthData {
  average: number;
  min: number;
  max: number;
  outliersExcluded: number;
}

interface CycleScoreCardProps {
  headlineScore: number | null;
  headlineLabel: string;
  cycleVariability: CycleVariabilityData | null;
  avgCycleLength: AvgCycleLengthData | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  dailyLogsAnalyzed: number;
}

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const REGULARITY_STYLE: Record<
  CycleVariabilityData['label'],
  { label: string; className: string }
> = {
  REGULAR: { label: 'Élevée', className: 'bg-green' },
  SOMEWHAT_VARIABLE: { label: 'Moyenne', className: 'bg-amber' },
  IRREGULAR: { label: 'Faible', className: 'bg-danger' },
};

const CONFIDENCE_STYLE: Record<
  'LOW' | 'MEDIUM' | 'HIGH',
  { label: string; className: string; width: number }
> = {
  HIGH: { label: 'Élevée', className: 'bg-green', width: 90 },
  MEDIUM: { label: 'Moyenne', className: 'bg-amber', width: 60 },
  LOW: { label: 'Faible', className: 'bg-danger', width: 30 },
};

function completenessFor(dailyLogsAnalyzed: number): {
  label: string;
  className: string;
  width: number;
} {
  if (dailyLogsAnalyzed >= 30) return { label: 'Excellente', className: 'bg-primary', width: 95 };
  if (dailyLogsAnalyzed >= 10) return { label: 'Bonne', className: 'bg-primary', width: 65 };
  return { label: 'Faible', className: 'bg-danger', width: 25 };
}

function regularityWidth(stddev: number): number {
  return Math.min(100, Math.max(15, 100 - stddev * 10));
}

interface DimensionRowProps {
  label: string;
  value: { label: string; className: string; width: number } | null;
  emptyText: string;
}

function DimensionRow({ label, value, emptyText }: DimensionRowProps): React.JSX.Element {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-navy">{label}</span>
        {value && <span className="text-sm font-bold text-navy">{value.label}</span>}
      </div>
      {value ? (
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${value.className}`}
            style={{ width: `${value.width}%` }}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

export function CycleScoreCard({
  headlineScore,
  headlineLabel,
  cycleVariability,
  avgCycleLength,
  confidence,
  dailyLogsAnalyzed,
}: CycleScoreCardProps): React.JSX.Element {
  const progress = headlineScore !== null ? headlineScore / 100 : 0;
  const dash = progress * CIRCUMFERENCE;

  const regularity = cycleVariability ? REGULARITY_STYLE[cycleVariability.label] : null;
  const regularityValue = cycleVariability
    ? { ...regularity!, width: regularityWidth(cycleVariability.stddev) }
    : null;
  const predictability = confidence ? CONFIDENCE_STYLE[confidence] : null;
  const completeness = completenessFor(dailyLogsAnalyzed);

  const keyInsights: Array<{ text: string; tone: 'success' | 'warning' }> = [];
  if (cycleVariability) {
    if (cycleVariability.label === 'REGULAR' && avgCycleLength) {
      keyInsights.push({
        text: `Ton cycle est régulier avec une durée moyenne de ${avgCycleLength.average} jours.`,
        tone: 'success',
      });
    } else {
      keyInsights.push({
        text: 'Certains cycles montrent des variations de durée. Continue à observer.',
        tone: 'warning',
      });
    }
  }
  keyInsights.push(
    dailyLogsAnalyzed >= 10
      ? {
          text: 'Tu enregistres tes données régulièrement, ce qui améliore les prédictions.',
          tone: 'success',
        }
      : {
          text: 'Ajoute plus de données pour affiner tes analyses.',
          tone: 'warning',
        },
  );

  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <div className="mb-5">
        <h2 className="flex items-center gap-2 text-xl font-bold text-navy">
          <span className="text-2xl">✨</span>
          Cycle Score
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Analyse globale de ton cycle</p>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 128 128" className="h-full w-full">
            <circle
              cx="64"
              cy="64"
              r={RADIUS}
              fill="none"
              strokeWidth="12"
              className="stroke-gray-100"
            />
            {headlineScore !== null && (
              <circle
                cx="64"
                cy="64"
                r={RADIUS}
                fill="none"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                transform="rotate(-90 64 64)"
                className="stroke-primary transition-[stroke-dasharray] duration-700 ease-out"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {headlineScore !== null ? (
              <>
                <div className="text-2xl font-bold text-navy">
                  <AnimatedNumber value={headlineScore} />
                </div>
                <div className="text-xs text-muted-foreground">/100</div>
              </>
            ) : (
              <div className="px-3 text-xs text-muted-foreground">Pas encore assez de données</div>
            )}
          </div>
        </div>
        <div className="flex-1">
          <p className="mb-3 text-xs text-muted-foreground">{headlineLabel}</p>
          <div className="flex flex-col gap-4">
            <DimensionRow
              label="Régularité du cycle"
              value={regularityValue}
              emptyText="Pas encore assez de cycles"
            />
            <DimensionRow
              label="Prévisibilité"
              value={predictability}
              emptyText="Pas encore de prédiction"
            />
            <DimensionRow label="Complétude des données" value={completeness} emptyText="" />
          </div>
        </div>
      </div>

      {keyInsights.length > 0 && (
        <div className="border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-navy">Points clés</h3>
          <div className="flex flex-col gap-2">
            {keyInsights.map((insight) => (
              <div key={insight.text} className="flex items-start gap-2">
                {insight.tone === 'success' ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green" />
                ) : (
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber" />
                )}
                <p className="text-xs text-muted-foreground">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
