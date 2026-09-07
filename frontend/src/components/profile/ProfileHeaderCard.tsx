import { greetingName } from '@/lib/utils';

interface ProfileHeaderCardProps {
  email: string;
  stats: { monthsActive: number; daysTracked: number; cyclesCompleted: number };
}

export function ProfileHeaderCard({ email, stats }: ProfileHeaderCardProps): React.JSX.Element {
  const name = greetingName(email);

  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-2xl font-bold text-primary">
          {name.charAt(0)}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-navy">{name}</h2>
          <p className="text-sm text-muted-foreground">{email}</p>
          <span className="mt-2 inline-block rounded-full bg-green-soft px-2 py-1 text-xs font-medium text-green">
            Membre depuis {stats.monthsActive} mois
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-gray-50 p-3 text-center">
          <div className="text-lg font-bold text-navy">{stats.monthsActive}</div>
          <div className="text-xs text-muted-foreground">Mois actifs</div>
        </div>
        <div className="rounded-lg border border-border bg-gray-50 p-3 text-center">
          <div className="text-lg font-bold text-navy">{stats.daysTracked}</div>
          <div className="text-xs text-muted-foreground">Jours tracés</div>
        </div>
        <div className="rounded-lg border border-border bg-gray-50 p-3 text-center">
          <div className="text-lg font-bold text-navy">{stats.cyclesCompleted}</div>
          <div className="text-xs text-muted-foreground">Cycles complets</div>
        </div>
      </div>
    </div>
  );
}
