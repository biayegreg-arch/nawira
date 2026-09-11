import { Calendar, Target, Zap, Activity, CheckCircle2 } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

interface CycleSummary {
  isOutlier: boolean;
}

interface ConceptionStatsCardProps {
  monthsActive: number;
  cyclesCompleted: number;
  daysTracked: number;
  totalDaysSinceActivation: number;
  cycles: CycleSummary[];
}

export function ConceptionStatsCard({
  monthsActive,
  cyclesCompleted,
  daysTracked,
  totalDaysSinceActivation,
  cycles,
}: ConceptionStatsCardProps): React.JSX.Element {
  const regularOvulationRate =
    cycles.length > 0
      ? Math.round((cycles.filter((c) => !c.isOutlier).length / cycles.length) * 100)
      : null;

  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <h2 className="mb-5 text-lg font-bold text-navy">Ton parcours de conception</h2>

      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Calendar size={18} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Projet Bébé activé</div>
            <div className="text-base font-bold text-navy">
              {monthsActive === 0 ? 'Ce mois-ci' : `Depuis ${monthsActive} mois`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-green-soft text-green">
            <Target size={18} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Fenêtres fertiles</div>
            <div className="text-base font-bold text-navy">
              {cyclesCompleted === 0
                ? 'Pas encore de cycle complet'
                : `${cyclesCompleted} fenêtre${cyclesCompleted > 1 ? 's' : ''} optimale${cyclesCompleted > 1 ? 's' : ''}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-soft text-amber">
            <Zap size={18} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Taux d&rsquo;ovulation régulière</div>
            <div className="text-base font-bold text-navy">
              {regularOvulationRate === null ? (
                'Pas encore assez de données'
              ) : (
                <AnimatedNumber value={regularOvulationRate} suffix=" %" />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Activity size={18} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Données enregistrées</div>
            <div className="text-base font-bold text-navy">
              <AnimatedNumber value={daysTracked} />/{totalDaysSinceActivation} jours
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-green-soft/40 p-4">
        <p className="text-xs leading-relaxed text-navy">
          <CheckCircle2 size={12} className="mr-1 inline text-green" />
          {regularOvulationRate !== null && regularOvulationRate >= 70
            ? 'Tes données indiquent une ovulation régulière. Continue à enregistrer quotidiennement pour optimiser tes chances.'
            : 'Continue à enregistrer tes cycles régulièrement — plus tu suis, plus les estimations deviennent fiables.'}
        </p>
      </div>
    </div>
  );
}
