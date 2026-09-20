'use client';

import { useMemo, useState } from 'react';
import {
  Heart,
  CloudRain,
  Wind,
  Frown,
  Star,
  HeartPulse,
  Zap,
  AlignJustify,
  CircleSlash,
  Droplets,
  Cookie,
  Flame,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { staggerDelay } from '@/lib/utils';

export type CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL';

export interface TopSymptomsData {
  byPhase: Record<CyclePhase, Array<{ symptom: string; count: number; frequency: number }>>;
  daysLogged: Record<CyclePhase, number>;
}

interface SymptomStatisticsProps {
  topSymptoms: TopSymptomsData | null;
}

export const PHASE_LABELS: Record<CyclePhase, string> = {
  MENSTRUAL: 'Règles',
  FOLLICULAR: 'Phase folliculaire',
  OVULATORY: 'Ovulation',
  LUTEAL: 'Phase lutéale',
};

const PHASE_ORDER: CyclePhase[] = ['MENSTRUAL', 'FOLLICULAR', 'OVULATORY', 'LUTEAL'];

const SYMPTOM_LABELS: Record<string, string> = {
  CRAMPS: 'Crampes',
  HEADACHE: 'Maux de tête',
  BLOATING: 'Ballonnements',
  NAUSEA: 'Nausées',
  ACNE: 'Acné',
  TENDER_BREASTS: 'Seins sensibles',
  FATIGUE: 'Fatigue',
  BACK_PAIN: 'Douleurs dorsales',
  CONSTIPATION: 'Constipation',
  DIARRHEA: 'Diarrhée',
  FOOD_CRAVINGS: 'Envies alimentaires',
  LIBIDO_CHANGE: 'Changement de libido',
};

const SYMPTOM_ICONS: Record<string, LucideIcon> = {
  CRAMPS: Heart,
  HEADACHE: CloudRain,
  BLOATING: Wind,
  NAUSEA: Frown,
  ACNE: Star,
  TENDER_BREASTS: HeartPulse,
  FATIGUE: Zap,
  BACK_PAIN: AlignJustify,
  CONSTIPATION: CircleSlash,
  DIARRHEA: Droplets,
  FOOD_CRAVINGS: Cookie,
  LIBIDO_CHANGE: Flame,
};

function mostLoggedPhase(daysLogged: Record<CyclePhase, number>): CyclePhase {
  return PHASE_ORDER.reduce((best, phase) => (daysLogged[phase] > daysLogged[best] ? phase : best));
}

export function SymptomStatistics({ topSymptoms }: SymptomStatisticsProps): React.JSX.Element {
  const defaultPhase = useMemo(
    () => (topSymptoms ? mostLoggedPhase(topSymptoms.daysLogged) : 'MENSTRUAL'),
    [topSymptoms],
  );
  const [selectedPhase, setSelectedPhase] = useState<CyclePhase>(defaultPhase);
  const activePhase = topSymptoms ? selectedPhase : defaultPhase;

  return (
    <div className="rounded-xl border border-border bg-white p-4 sm:p-6">
      <h2 className="mb-5 text-base font-bold md:text-lg text-navy">Symptômes observés</h2>

      {!topSymptoms ? (
        <p className="text-xs text-muted-foreground">
          Pas encore assez de données. Enregistre au moins 5 journées pour voir tes symptômes les
          plus fréquents.
        </p>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {PHASE_ORDER.map((phase) => {
              const active = activePhase === phase;
              return (
                <button
                  key={phase}
                  type="button"
                  onClick={() => setSelectedPhase(phase)}
                  aria-pressed={active}
                  className={`min-h-12 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-95 ${
                    active
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border bg-white text-navy hover:bg-gray-50'
                  }`}
                >
                  {PHASE_LABELS[phase]}
                </button>
              );
            })}
          </div>

          {topSymptoms.byPhase[activePhase].length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucun symptôme enregistré pour cette phase pour l&rsquo;instant.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {topSymptoms.byPhase[activePhase].map((s, i) => {
                const Icon = SYMPTOM_ICONS[s.symptom] ?? Star;
                const percentage = Math.round(s.frequency * 100);
                return (
                  <div
                    key={s.symptom}
                    className="animate-fade-in-up flex items-center gap-3"
                    style={staggerDelay(i)}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-purple">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-navy">
                          {SYMPTOM_LABELS[s.symptom] ?? s.symptom}
                        </span>
                        <span className="text-xs font-semibold text-navy">
                          <AnimatedNumber value={percentage} suffix="%" />
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-primary-light transition-[width] duration-700 ease-out"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {s.count} jour{s.count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 border-t border-border pt-5">
            <p className="flex items-start gap-1 text-xs text-muted-foreground">
              <Info size={12} className="mt-0.5 shrink-0" />
              Sélectionne une phase pour voir tes symptômes les plus fréquents durant cette période.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
