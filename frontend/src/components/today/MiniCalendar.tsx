import Link from 'next/link';
import { MonthGrid, type CalendarDayType } from '@/components/calendar/MonthGrid';
import { CalendarLegend } from '@/components/calendar/CalendarLegend';

interface MiniCalendarProps {
  dayTypes: Record<string, CalendarDayType>;
}

export function MiniCalendar({ dayTypes }: MiniCalendarProps): React.JSX.Element {
  const now = new Date();
  const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
    now,
  );

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-navy">Mon calendrier</h2>
        <Link
          href="/app/calendar"
          className="inline-flex min-h-11 items-center text-xs font-medium text-primary"
        >
          Voir tout
        </Link>
      </div>
      <div className="mb-2 text-center text-sm font-semibold text-navy capitalize">
        {monthLabel}
      </div>
      <MonthGrid
        year={now.getFullYear()}
        month={now.getMonth()}
        dayTypes={dayTypes}
        size="compact"
      />
      <div className="mt-4 border-t border-border pt-4">
        <CalendarLegend />
      </div>
    </div>
  );
}
