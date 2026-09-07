'use client';

import { useState, type FormEvent } from 'react';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Button } from '@/components/ui/Button';

const FLOW_OPTIONS = [
  { value: 'NONE', label: 'Aucun' },
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
}

interface DailyLogFormProps {
  initialValues: DailyLogInitialValues;
  todayFlowLogged: boolean;
  saving: boolean;
  onSubmit: (values: DailyLogSubmitValues) => void;
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

  const toggleSingle =
    (current: string | null, setValue: (v: string | null) => void) =>
    (value: string): void =>
      setValue(current === value ? null : value);

  const toggleSymptom = (value: string): void => {
    setSymptoms((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  };

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const parsedSleepHours = sleepHours.trim() === '' ? null : Number(sleepHours);
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
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-navy">Saignements</h2>
        <ChipGroup
          options={FLOW_OPTIONS}
          selectedValues={[flow]}
          onToggle={(value) => setFlow(flow === value ? 'NONE' : value)}
        />
        {todayFlowLogged && (
          <p className="text-xs text-muted-foreground">
            Tu as déjà enregistré tes règles aujourd&rsquo;hui — sélectionne une valeur pour la
            corriger.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-navy">Douleur</h2>
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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-navy">Humeur</h2>
        <ChipGroup
          options={MOOD_OPTIONS}
          selectedValues={mood ? [mood] : []}
          onToggle={toggleSingle(mood, setMood)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-navy">Énergie</h2>
        <ChipGroup
          options={ENERGY_OPTIONS}
          selectedValues={energy ? [energy] : []}
          onToggle={toggleSingle(energy, setEnergy)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-navy">Sommeil</h2>
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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-navy">Symptômes</h2>
        <ChipGroup options={SYMPTOM_OPTIONS} selectedValues={symptoms} onToggle={toggleSymptom} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-navy">Note</h2>
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
      </section>

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}
