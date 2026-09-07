'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Droplet, Heart, Smile, Zap, Moon, Thermometer, Pencil, Activity } from 'lucide-react';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Button } from '@/components/ui/Button';
import { LogProgressBar, type ProgressStep } from './LogProgressBar';

const INTENSITY_OPTIONS = [
  { value: 'SPOTTING', label: 'Spotting' },
  { value: 'LIGHT', label: 'Léger' },
  { value: 'MEDIUM', label: 'Moyen' },
  { value: 'HEAVY', label: 'Abondant' },
];

const MOOD_OPTIONS = [
  { value: 'VERY_GOOD', label: 'Très bien' },
  { value: 'GOOD', label: 'Bien' },
  { value: 'TIRED', label: 'Fatiguée' },
  { value: 'STRESSED', label: 'Stressée' },
  { value: 'LOW', label: 'Humeur basse' },
];

const ENERGY_OPTIONS = [
  { value: 'VERY_LOW', label: 'Très faible' },
  { value: 'LOW', label: 'Faible' },
  { value: 'MEDIUM', label: 'Moyenne' },
  { value: 'HIGH', label: 'Élevée' },
  { value: 'VERY_HIGH', label: 'Très élevée' },
];

const SLEEP_QUALITY_OPTIONS = [
  { value: 'POOR', label: 'Mauvaise' },
  { value: 'FAIR', label: 'Correcte' },
  { value: 'GOOD', label: 'Bonne' },
  { value: 'EXCELLENT', label: 'Excellente' },
];

const SYMPTOM_OPTIONS = [
  { value: 'CRAMPS', label: 'Crampes' },
  { value: 'HEADACHE', label: 'Maux de tête' },
  { value: 'BLOATING', label: 'Ballonnements' },
  { value: 'NAUSEA', label: 'Nausées' },
  { value: 'ACNE', label: 'Acné' },
  { value: 'TENDER_BREASTS', label: 'Seins sensibles' },
  { value: 'FATIGUE', label: 'Fatigue' },
  { value: 'BACK_PAIN', label: 'Douleurs dorsales' },
  { value: 'CONSTIPATION', label: 'Constipation' },
  { value: 'DIARRHEA', label: 'Diarrhée' },
  { value: 'FOOD_CRAVINGS', label: 'Envies alimentaires' },
  { value: 'LIBIDO_CHANGE', label: 'Changement de libido' },
];

const UNIT_OPTIONS = [
  { value: 'CELSIUS', label: '°C' },
  { value: 'FAHRENHEIT', label: '°F' },
];

const NOTE_MAX_LENGTH = 1000;

export interface DailyLogInitialValues {
  painLevel: number | null;
  painLocation: string | null;
  mood: string | null;
  energy: string | null;
  sleepQuality: string | null;
  sleepHours: number | null;
  note: string | null;
  symptoms: string[];
  temperatureValue: number | null;
  temperatureUnit: 'CELSIUS' | 'FAHRENHEIT' | null;
}

export interface DailyLogSubmitValues {
  /** 'NONE' means "don't call POST /api/period-events". */
  flow: string;
  painLevel: number | null;
  painLocation: string | null;
  mood: string | null;
  energy: string | null;
  sleepQuality: string | null;
  sleepHours: number | null;
  note: string | null;
  symptoms: string[];
  temperatureValue: number | null;
  temperatureUnit: 'CELSIUS' | 'FAHRENHEIT' | null;
}

interface DailyLogFormProps {
  initialValues: DailyLogInitialValues;
  todayFlowLogged: boolean;
  saving: boolean;
  onSubmit: (values: DailyLogSubmitValues) => void;
}

function SectionCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number }>;
  iconBg: string;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <div className="mb-5 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}
        >
          <Icon size={18} />
        </div>
        <h2 className="text-base font-bold text-navy">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function DailyLogForm({
  initialValues,
  todayFlowLogged,
  saving,
  onSubmit,
}: DailyLogFormProps): React.JSX.Element {
  // Flow always starts unselected — there is no endpoint exposing today's
  // actual PeriodEvent.flow value (see docs/superpowers/specs/2026-09-07-
  // phase4-daily-journal-design.md §"Flow integration — no new endpoint").
  const [flow, setFlow] = useState('NONE');
  const [painLevel, setPainLevel] = useState<number | null>(initialValues.painLevel);
  const [painLocation, setPainLocation] = useState(initialValues.painLocation ?? '');
  const [mood, setMood] = useState<string | null>(initialValues.mood);
  const [energy, setEnergy] = useState<string | null>(initialValues.energy);
  const [sleepQuality, setSleepQuality] = useState<string | null>(initialValues.sleepQuality);
  const [sleepHours, setSleepHours] = useState(
    initialValues.sleepHours !== null ? String(initialValues.sleepHours) : '',
  );
  const [symptoms, setSymptoms] = useState<string[]>(initialValues.symptoms);
  const [note, setNote] = useState(initialValues.note ?? '');
  const [temperatureValue, setTemperatureValue] = useState(
    initialValues.temperatureValue !== null ? String(initialValues.temperatureValue) : '',
  );
  const [temperatureUnit, setTemperatureUnit] = useState<'CELSIUS' | 'FAHRENHEIT' | null>(
    initialValues.temperatureUnit,
  );

  const toggleSingle =
    (current: string | null, setValue: (v: string | null) => void) =>
    (value: string): void =>
      setValue(current === value ? null : value);

  const toggleSymptom = (value: string): void => {
    setSymptoms((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  };

  const progressSteps: ProgressStep[] = useMemo(
    () => [
      { key: 'flow', label: 'Règles', filled: flow !== 'NONE' },
      { key: 'symptoms', label: 'Symptômes', filled: symptoms.length > 0 },
      { key: 'mood', label: 'Humeur', filled: mood !== null },
      { key: 'temperature', label: 'Température', filled: temperatureValue.trim() !== '' },
      { key: 'note', label: 'Notes', filled: note.trim() !== '' },
    ],
    [flow, symptoms, mood, temperatureValue, note],
  );

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const parsedSleepHours = sleepHours.trim() === '' ? null : Number(sleepHours);
    const trimmedTemperature = temperatureValue.trim();
    const parsedTemperature = trimmedTemperature === '' ? null : Number(trimmedTemperature);
    const validTemperature =
      parsedTemperature !== null && Number.isFinite(parsedTemperature) ? parsedTemperature : null;

    onSubmit({
      flow,
      painLevel,
      painLocation: painLocation.trim() === '' ? null : painLocation.trim(),
      mood,
      energy,
      sleepQuality,
      sleepHours:
        parsedSleepHours !== null && Number.isFinite(parsedSleepHours) ? parsedSleepHours : null,
      note: note.trim() === '' ? null : note.trim(),
      symptoms,
      temperatureValue: validTemperature,
      temperatureUnit: validTemperature !== null ? (temperatureUnit ?? 'CELSIUS') : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <LogProgressBar steps={progressSteps} />

      <SectionCard icon={Droplet} iconBg="bg-rose-soft" iconColor="text-rose" title="Règles">
        <div className="flex flex-col gap-4">
          <div>
            <span className="mb-2 block text-sm font-medium text-navy">
              As-tu tes règles aujourd&rsquo;hui ?
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => flow === 'NONE' && setFlow('MEDIUM')}
                className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium ${
                  flow !== 'NONE'
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border bg-white text-navy hover:bg-gray-50'
                }`}
              >
                Oui
              </button>
              <button
                type="button"
                onClick={() => setFlow('NONE')}
                className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium ${
                  flow === 'NONE'
                    ? 'border-gray-300 bg-gray-50 text-body'
                    : 'border-border bg-white text-navy hover:bg-gray-50'
                }`}
              >
                Non
              </button>
            </div>
          </div>
          {flow !== 'NONE' && (
            <div>
              <span className="mb-2 block text-sm font-medium text-navy">Intensité</span>
              <ChipGroup
                options={INTENSITY_OPTIONS}
                selectedValues={[flow]}
                onToggle={(value) => setFlow(value)}
              />
            </div>
          )}
          {todayFlowLogged && (
            <p className="text-xs text-muted-foreground">
              Tu as déjà enregistré tes règles aujourd&rsquo;hui — sélectionne une valeur pour la
              corriger.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard icon={Heart} iconBg="bg-purple-soft" iconColor="text-purple" title="Symptômes">
        <ChipGroup options={SYMPTOM_OPTIONS} selectedValues={symptoms} onToggle={toggleSymptom} />
      </SectionCard>

      <SectionCard icon={Smile} iconBg="bg-amber-soft" iconColor="text-amber" title="Humeur">
        <ChipGroup
          options={MOOD_OPTIONS}
          selectedValues={mood ? [mood] : []}
          onToggle={toggleSingle(mood, setMood)}
        />
      </SectionCard>

      <SectionCard icon={Zap} iconBg="bg-amber-soft" iconColor="text-amber" title="Énergie">
        <ChipGroup
          options={ENERGY_OPTIONS}
          selectedValues={energy ? [energy] : []}
          onToggle={toggleSingle(energy, setEnergy)}
        />
      </SectionCard>

      <SectionCard icon={Moon} iconBg="bg-purple-soft" iconColor="text-purple" title="Sommeil">
        <div className="flex flex-col gap-3">
          <ChipGroup
            options={SLEEP_QUALITY_OPTIONS}
            selectedValues={sleepQuality ? [sleepQuality] : []}
            onToggle={toggleSingle(sleepQuality, setSleepQuality)}
          />
          <label className="flex max-w-[160px] flex-col gap-1.5 text-sm">
            <span className="font-medium text-navy">Heures de sommeil (optionnel)</span>
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              placeholder="Ex : 7.5"
              className="rounded-lg border border-border px-3.5 py-3 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard icon={Activity} iconBg="bg-rose-soft" iconColor="text-rose" title="Douleur">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-body">
              <span>Intensité</span>
              <span className="font-semibold text-navy">
                {painLevel === null ? 'Non renseigné' : `${painLevel}/10`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={painLevel ?? 0}
              onChange={(e) => setPainLevel(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="Intensité de la douleur, de 0 à 10"
            />
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-navy">Localisation (optionnel)</span>
            <input
              type="text"
              value={painLocation}
              onChange={(e) => setPainLocation(e.target.value)}
              placeholder="Ex : bas du dos, ventre…"
              maxLength={100}
              className="rounded-lg border border-border px-3.5 py-3 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard
        icon={Thermometer}
        iconBg="bg-amber-soft"
        iconColor="text-amber"
        title="Température basale"
      >
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
      </SectionCard>

      <SectionCard icon={Pencil} iconBg="bg-primary-soft" iconColor="text-primary" title="Notes">
        <label className="flex flex-col gap-1.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
            rows={4}
            placeholder="Un détail à te rappeler aujourd'hui…"
            className="resize-none rounded-lg border border-border px-3.5 py-3 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <span className="self-end text-xs text-muted-foreground">
            {note.length}/{NOTE_MAX_LENGTH}
          </span>
        </label>
      </SectionCard>

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        {saving ? 'Enregistrement…' : 'Enregistrer mes données'}
      </Button>
    </form>
  );
}
