'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PeriodLogCtaProps {
  todayLogged: boolean;
  onLog: () => void;
  loading: boolean;
}

export function PeriodLogCta({
  todayLogged,
  onLog,
  loading,
}: PeriodLogCtaProps): React.JSX.Element {
  if (todayLogged) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-rose">
        <Check size={16} />
        Règles enregistrées aujourd&rsquo;hui
      </div>
    );
  }

  return (
    <Button onClick={onLog} disabled={loading} className="w-full sm:w-auto">
      {loading ? 'Enregistrement…' : 'Mes règles ont commencé'}
    </Button>
  );
}
