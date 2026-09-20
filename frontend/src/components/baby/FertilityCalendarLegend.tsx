import { cn } from '@/lib/utils';
import type { CalendarDayType } from '@/components/calendar/MonthGrid';

const ITEMS: Array<{ type: CalendarDayType; label: string; desc: string }> = [
  { type: 'observed', label: 'Règles', desc: 'Tes règles enregistrées' },
  { type: 'fertile', label: 'Fenêtre fertile', desc: 'Meilleures chances de conception' },
  { type: 'ovulation', label: 'Ovulation estimée', desc: "Jour estimé d'ovulation" },
  { type: 'predicted', label: 'Prochaines règles', desc: 'Estimation basée sur tes cycles' },
  { type: 'today', label: "Aujourd'hui", desc: '' },
];

const DOT_STYLES: Record<CalendarDayType, string> = {
  observed: 'bg-rose',
  predicted: 'bg-primary-light',
  fertile: 'bg-green',
  ovulation: 'bg-amber',
  today: 'bg-primary',
};

export function FertilityCalendarLegend(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-white p-4 sm:p-6">
      <h3 className="mb-3 text-base font-bold text-navy">Légende du calendrier</h3>
      <div className="flex flex-col gap-3">
        {ITEMS.map((item) => (
          <div key={item.type} className="flex items-start gap-3">
            <div className={cn('mt-1 h-4 w-4 shrink-0 rounded', DOT_STYLES[item.type])} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-navy">{item.label}</div>
              {item.desc && <div className="text-sm text-muted-foreground">{item.desc}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
