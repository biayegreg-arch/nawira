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

export interface OtherSignalsValues {
  temperatureValue: number | null;
  temperatureUnit: 'CELSIUS' | 'FAHRENHEIT' | null;
  cervicalMucusType: string | null;
}

interface OtherSignalsCardProps {
  initialValues: OtherSignalsValues;
  saving: boolean;
  onSubmit: (values: OtherSignalsValues) => void;
}

export function OtherSignalsCard({
  initialValues,
  saving,
  onSubmit,
}: OtherSignalsCardProps): React.JSX.Element {
  const [temperatureValue, setTemperatureValue] = useState(
    initialValues.temperatureValue !== null ? String(initialValues.temperatureValue) : '',
  );
  const [temperatureUnit, setTemperatureUnit] = useState<'CELSIUS' | 'FAHRENHEIT' | null>(
    initialValues.temperatureUnit,
  );
  const [cervicalMucusType, setCervicalMucusType] = useState<string | null>(
    initialValues.cervicalMucusType,
  );

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
        <h2 className="text-lg font-bold text-navy">Autres signaux du jour</h2>
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
          onToggle={(value) => setCervicalMucusType(value === cervicalMucusType ? null : value)}
        />
      </section>

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}
