'use client';

import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { todayIso } from '@/lib/calendar-day-types';

const MAX_RANGE_DAYS = 14;

const FLOW_OPTIONS = [
  { value: 'SPOTTING', label: 'Spotting' },
  { value: 'LIGHT', label: 'Léger' },
  { value: 'MEDIUM', label: 'Moyen' },
  { value: 'HEAVY', label: 'Abondant' },
];

export interface PeriodRangeSubmitValues {
  startDate: string;
  endDate: string;
  flow: string;
}

interface PeriodRangeFormProps {
  onSubmit: (values: PeriodRangeSubmitValues) => Promise<void>;
}

function daysInclusive(startDate: string, endDate: string): number {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
}

export function PeriodRangeForm({ onSubmit }: PeriodRangeFormProps): React.JSX.Element {
  const today = todayIso();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [flow, setFlow] = useState('MEDIUM');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  function validate(): string | null {
    if (!startDate || !endDate) return 'Indique une date de début et une date de fin.';
    if (startDate > endDate) return 'La date de début doit précéder la date de fin.';
    if (endDate > today) return 'La date de fin ne peut pas être dans le futur.';
    if (daysInclusive(startDate, endDate) > MAX_RANGE_DAYS) {
      return `La période ne peut pas dépasser ${MAX_RANGE_DAYS} jours.`;
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setSaving(true);
    try {
      await onSubmit({ startDate, endDate, flow });
      setStartDate('');
      setEndDate('');
      setFlow('MEDIUM');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-4 rounded-xl border border-border bg-white p-5"
    >
      <div className="flex items-center gap-2">
        <CalendarRange size={18} className="text-primary" />
        <h3 className="text-base font-bold text-navy">Ajouter des règles passées</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Tu as raté quelques jours ? Indique quand tes dernières règles ont commencé et fini — chaque
        jour de la période sera enregistré d&rsquo;un coup.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Début"
          type="date"
          name="periodStartDate"
          value={startDate}
          max={today}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <Field
          label="Fin"
          type="date"
          name="periodEndDate"
          value={endDate}
          max={today}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-navy">Flux</span>
        <ChipGroup options={FLOW_OPTIONS} selectedValues={[flow]} onToggle={setFlow} />
      </div>

      {validationError && <p className="text-xs text-red-700">{validationError}</p>}

      <Button type="submit" variant="secondary" disabled={saving} className="min-h-12 w-full">
        {saving ? 'Enregistrement…' : 'Ajouter cette période'}
      </Button>
    </form>
  );
}
