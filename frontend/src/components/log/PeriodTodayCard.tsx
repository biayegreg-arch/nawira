'use client';

import { Droplet } from 'lucide-react';
import { ChipGroup } from '@/components/ui/ChipGroup';

const INTENSITY_OPTIONS = [
  { value: 'SPOTTING', label: 'Spotting' },
  { value: 'LIGHT', label: 'Léger' },
  { value: 'MEDIUM', label: 'Moyen' },
  { value: 'HEAVY', label: 'Abondant' },
];

interface PeriodTodayCardProps {
  flow: string;
  onFlowChange: (flow: string) => void;
  todayFlowLogged: boolean;
}

/**
 * Today's flow toggle — kept as its own card (not nested inside
 * DailyLogForm's <form>) so PeriodRangeForm can render right below it,
 * both above the fold. A nested <form> would be invalid HTML and would
 * hand its submit button to the outer form, so this card must stay a
 * sibling rather than get folded back into DailyLogForm.
 */
export function PeriodTodayCard({
  flow,
  onFlowChange,
  todayFlowLogged,
}: PeriodTodayCardProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-soft text-rose">
          <Droplet size={18} />
        </div>
        <h2 className="text-base font-bold text-navy">Règles</h2>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-2 block text-sm font-medium text-navy">
            As-tu tes règles aujourd&rsquo;hui ?
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => flow === 'NONE' && onFlowChange('MEDIUM')}
              className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97] ${
                flow !== 'NONE'
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-white text-navy hover:bg-gray-50'
              }`}
            >
              Oui
            </button>
            <button
              type="button"
              onClick={() => onFlowChange('NONE')}
              className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97] ${
                flow === 'NONE'
                  ? 'border-gray-300 bg-gray-50 text-body'
                  : 'border-border bg-white text-navy hover:bg-gray-50'
              }`}
            >
              Non
            </button>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-navy">Intensité</span>
          <ChipGroup
            options={INTENSITY_OPTIONS}
            selectedValues={flow !== 'NONE' ? [flow] : []}
            onToggle={onFlowChange}
          />
        </div>

        {todayFlowLogged && (
          <p className="text-xs text-muted-foreground">
            Tu as déjà enregistré tes règles aujourd&rsquo;hui — sélectionne une valeur ci-dessus
            pour la corriger.
          </p>
        )}
      </div>
    </div>
  );
}
