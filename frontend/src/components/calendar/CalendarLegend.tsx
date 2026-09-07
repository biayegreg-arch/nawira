import { cn } from '@/lib/utils';
import type { CalendarDayType } from './MonthGrid';

const ITEMS: Array<{ type: CalendarDayType; label: string }> = [
  { type: 'observed', label: 'Règles' },
  { type: 'predicted', label: 'Prédit' },
  { type: 'fertile', label: 'Fenêtre fertile' },
  { type: 'ovulation', label: 'Ovulation estimée' },
  { type: 'today', label: "Aujourd'hui" },
];

const DOT_STYLES: Record<CalendarDayType, string> = {
  observed: 'bg-rose',
  predicted: 'bg-primary-light',
  fertile: 'bg-green',
  ovulation: 'bg-amber',
  today: 'bg-primary',
};

export function CalendarLegend(): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {ITEMS.map((item) => (
        <div key={item.type} className="flex items-center gap-1.5">
          <div className={cn('h-3 w-3 rounded-full', DOT_STYLES[item.type])} />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
