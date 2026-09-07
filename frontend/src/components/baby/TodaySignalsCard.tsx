'use client';

import { useState, type FormEvent } from 'react';
import { Thermometer } from 'lucide-react';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Button } from '@/components/ui/Button';

const UNIT_OPTIONS = [
  { value: 'CELSIUS', label: '°C' },
  { value: 'FAHRENHEIT', label: '°F' },
];

const MUCUS_OPTIONS = [
  { value: 'DRY', label: 'Sèche' },
  { value: 'STICKY', label: 'Collante' },
  { value: 'CREAMY', label: 'Crémeuse' },
  { value: 'WATERY', label: 'Aqueuse' },
  { value: 'EGG_WHITE', label: "Blanc d'œuf" },
];

const LH_OPTIONS = [
  { value: 'NEGATIVE', label: 'Négatif' },
  { value: 'POSITIVE', label: 'Positif' },
  { value: 'PEAK', label: 'Pic' },
  { value: 'INCONCLUSIVE', label: 'Non concluant' },
];

export interface TodaySignalsValues {
  temperatureValue: number | null;
  temperatureUnit: 'CELSIUS' | 'FAHRENHEIT' | null;
  cervicalMucusType: string | null;
  lhResult: string | null;
}

interface TodaySignalsCardProps {
  initialValues: TodaySignalsValues;
  saving: boolean;
  onSubmit: (values: TodaySignalsValues) => void;
}

export function TodaySignalsCard({
  initialValues,
  saving,
  onSubmit,
}: TodaySignalsCardProps): React.JSX.Element {
  const [temperatureValue, setTemperatureValue] = useState(
    initialValues.temperatureValue !== null ? String(initialValues.temperatureValue) : '',
  );
  const [temperatureUnit, setTemperatureUnit] = useState<'CELSIUS' | 'FAHRENHEIT' | null>(
    initialValues.temperatureUnit,
  );
  const [cervicalMucusType, setCervicalMucusType] = useState<string | null>(
    initialValues.cervicalMucusType,
  );
  const [lhResult, setLhResult] = useState<string | null>(initialValues.lhResult);

  const toggleSingle =
    (current: string | null, setValue: (v: string | null) => void) =>
    (value: string): void =>
      setValue(current === value ? null : value);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = temperatureValue.trim();
    const parsedTemperature = trimmed === '' ? null : Number(trimmed);
    const validTemperature =
      parsedTemperature !== null && Number.isFinite(parsedTemperature) ? parsedTemperature : null;

    onSubmit({
      temperatureValue: validTemperature,
      temperatureUnit: validTemperature !== null ? (temperatureUnit ?? 'CELSIUS') : null,
      cervicalMucusType,
      lhResult,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-border bg-white p-6"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-soft text-rose">
          <Thermometer size={18} />
        </div>
        <h2 className="text-lg font-bold text-navy">Signaux du jour</h2>
      </div>

      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium text-navy">Température basale</span>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.1"
            value={temperatureValue}
            onChange={(e) => setTemperatureValue(e.target.value)}
            placeholder="Ex : 36.8"
            className="w-28 rounded-lg border border-border px-3.5 py-3 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <ChipGroup
            options={UNIT_OPTIONS}
            selectedValues={temperatureUnit ? [temperatureUnit] : []}
            onToggle={(value) =>
              setTemperatureUnit(
                value === temperatureUnit ? null : (value as 'CELSIUS' | 'FAHRENHEIT'),
              )
            }
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium text-navy">Glaire cervicale</span>
        <ChipGroup
          options={MUCUS_OPTIONS}
          selectedValues={cervicalMucusType ? [cervicalMucusType] : []}
          onToggle={toggleSingle(cervicalMucusType, setCervicalMucusType)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium text-navy">Test d&rsquo;ovulation (LH)</span>
        <ChipGroup
          options={LH_OPTIONS}
          selectedValues={lhResult ? [lhResult] : []}
          onToggle={toggleSingle(lhResult, setLhResult)}
        />
      </section>

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? 'Enregistrement…' : 'Enregistrer les signaux du jour'}
      </Button>
    </form>
  );
}
