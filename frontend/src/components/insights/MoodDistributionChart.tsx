import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { staggerDelay } from '@/lib/utils';

export interface MoodDistributionData {
  distribution: Array<{ mood: string; count: number; percentage: number }>;
}

interface MoodDistributionChartProps {
  moodDistribution: MoodDistributionData | null;
}

const MOOD_META: Record<string, { emoji: string; label: string; className: string }> = {
  VERY_GOOD: { emoji: '😄', label: 'Très bien', className: 'bg-primary' },
  GOOD: { emoji: '🙂', label: 'Bien', className: 'bg-primary-light' },
  TIRED: { emoji: '😕', label: 'Fatiguée', className: 'bg-amber' },
  STRESSED: { emoji: '😟', label: 'Stressée', className: 'bg-rose' },
  LOW: { emoji: '😢', label: 'Humeur basse', className: 'bg-danger' },
};

export function MoodDistributionChart({
  moodDistribution,
}: MoodDistributionChartProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <h2 className="mb-5 text-lg font-bold text-navy">Répartition de l&rsquo;humeur</h2>

      {!moodDistribution ? (
        <p className="text-xs text-muted-foreground">
          Pas encore assez de données. Enregistre ton humeur sur au moins 5 journées pour voir ta
          répartition.
        </p>
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-3">
            {moodDistribution.distribution.map((m, i) => {
              const meta = MOOD_META[m.mood] ?? {
                emoji: '🙂',
                label: m.mood,
                className: 'bg-primary',
              };
              return (
                <div
                  key={m.mood}
                  className="animate-fade-in-up flex items-center gap-3"
                  style={staggerDelay(i)}
                >
                  <span className="text-lg">{meta.emoji}</span>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{meta.label}</span>
                      <span className="text-sm font-semibold text-navy">
                        <AnimatedNumber value={m.percentage} suffix="%" />
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-[width] duration-700 ease-out ${meta.className}`}
                        style={{ width: `${m.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-border py-3 text-center text-xs text-muted-foreground">
            Basé sur {moodDistribution.distribution.reduce((sum, m) => sum + m.count, 0)}{' '}
            enregistrement
            {moodDistribution.distribution.reduce((sum, m) => sum + m.count, 0) !== 1 ? 's' : ''}
          </div>
        </>
      )}
    </div>
  );
}
