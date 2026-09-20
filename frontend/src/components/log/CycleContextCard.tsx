import { Activity } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

interface CycleContextPrediction {
  expectedPeriodStart: string;
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
  ovulationEstimate: string | null;
}

interface CycleContextCardProps {
  currentDay: number | null;
  cycleLength: number | null;
  todayLogged: boolean;
  prediction: CycleContextPrediction | null;
  today: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_PER_DAY);
}

export interface Phase {
  key: 'PERIOD' | 'FERTILE' | 'LUTEAL' | 'FOLLICULAR';
  label: string;
  colorClass: string;
}

export function derivePhase(
  todayLogged: boolean,
  prediction: CycleContextPrediction | null,
  today: string,
): Phase | null {
  if (todayLogged) {
    return { key: 'PERIOD', label: 'Règles', colorClass: 'text-rose' };
  }
  if (!prediction) return null;

  const { fertileWindowStart, fertileWindowEnd, ovulationEstimate } = prediction;
  if (fertileWindowStart && fertileWindowEnd) {
    if (today >= fertileWindowStart && today <= fertileWindowEnd) {
      return { key: 'FERTILE', label: 'Phase fertile 🌿', colorClass: 'text-green' };
    }
    if (ovulationEstimate && today > ovulationEstimate) {
      return { key: 'LUTEAL', label: 'Phase lutéale', colorClass: 'text-amber' };
    }
    if (today < fertileWindowStart) {
      return { key: 'FOLLICULAR', label: 'Phase folliculaire', colorClass: 'text-primary' };
    }
  }
  return null;
}

export function CycleContextCard({
  currentDay,
  cycleLength,
  todayLogged,
  prediction,
  today,
}: CycleContextCardProps): React.JSX.Element {
  const phase = derivePhase(todayLogged, prediction, today);

  let fertileWindowStatus = '—';
  if (prediction?.fertileWindowStart && prediction.fertileWindowEnd) {
    const daysToStart = daysUntil(today, prediction.fertileWindowStart);
    const daysToEnd = daysUntil(today, prediction.fertileWindowEnd);
    if (daysToStart > 0) {
      fertileWindowStatus = `dans ${daysToStart} jour${daysToStart > 1 ? 's' : ''}`;
    } else if (daysToEnd >= 0) {
      fertileWindowStatus = 'en cours';
    } else {
      fertileWindowStatus = 'terminée';
    }
  }

  const daysToPeriod = prediction ? daysUntil(today, prediction.expectedPeriodStart) : null;

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Activity size={15} />
        </div>
        <h3 className="text-base font-bold text-navy">Contexte du cycle</h3>
      </div>
      <div className="flex flex-col gap-2">
        {phase && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Phase actuelle</span>
            <span className={`font-semibold ${phase.colorClass}`}>{phase.label}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Jour du cycle</span>
          <span className="font-semibold text-navy">
            {currentDay !== null ? (
              <>
                Jour <AnimatedNumber value={currentDay} />
                {cycleLength ? ` / ${cycleLength}` : ''}
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Prochaines règles</span>
          <span className="font-semibold text-navy">
            {daysToPeriod !== null && daysToPeriod >= 0 ? (
              <AnimatedNumber value={daysToPeriod} prefix="dans " suffix=" jours" />
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Fenêtre fertile</span>
          <span className="font-semibold text-amber">{fertileWindowStatus}</span>
        </div>
      </div>
    </div>
  );
}
