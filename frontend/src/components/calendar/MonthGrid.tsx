import { cn } from '@/lib/utils';

export type CalendarDayType = 'observed' | 'predicted' | 'today';

interface MonthGridProps {
  /** Full year, e.g. 2026. */
  year: number;
  /** 0-indexed month (JS Date convention: 0 = January). */
  month: number;
  /** Keyed by ISO date (`YYYY-MM-DD`). */
  dayTypes: Record<string, CalendarDayType>;
  size?: 'compact' | 'full';
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const TYPE_STYLES: Record<CalendarDayType, string> = {
  observed: 'bg-rose-soft text-rose font-semibold',
  predicted: 'bg-primary-soft text-primary-light font-semibold',
  today: 'bg-primary text-white font-bold',
};

function toIsoDate(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function MonthGrid({
  year,
  month,
  dayTypes,
  size = 'full',
}: MonthGridProps): React.JSX.Element {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // JS getDay(): 0=Sunday..6=Saturday. Convert to a Monday-first index.
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const cellSize = size === 'compact' ? 'h-7 w-7' : 'h-9 w-9';

  return (
    <div>
      <div className="grid grid-cols-7">
        {DAY_LABELS.map((label) => (
          <div key={label} className="py-1 text-center text-xs font-medium text-muted-light">
            {label}
          </div>
        ))}
      </div>
      <div className={cn('grid grid-cols-7', size === 'compact' ? 'gap-y-1' : 'gap-y-2')}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const iso = toIsoDate(year, month, day);
          const type = dayTypes[iso];
          return (
            <div key={iso} className="flex items-center justify-center">
              <div
                className={cn(
                  'flex items-center justify-center rounded-full text-xs',
                  cellSize,
                  type ? TYPE_STYLES[type] : 'text-navy',
                )}
              >
                {day}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
