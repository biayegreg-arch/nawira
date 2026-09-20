'use client';

const MOOD_OPTIONS = [
  { value: 'VERY_GOOD', emoji: '😄', label: 'Très bien' },
  { value: 'GOOD', emoji: '🙂', label: 'Bien' },
  { value: 'TIRED', emoji: '😕', label: 'Fatiguée' },
  { value: 'STRESSED', emoji: '😟', label: 'Stressée' },
  { value: 'LOW', emoji: '😢', label: 'Humeur basse' },
];

interface MoodSelectorProps {
  selectedMood: string | null;
  saving: boolean;
  onSelect: (mood: string) => void;
}

export function MoodSelector({
  selectedMood,
  saving,
  onSelect,
}: MoodSelectorProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <h2 className="mb-4 text-base font-semibold text-navy">
        Comment te sens-tu aujourd&rsquo;hui ?
      </h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
        {MOOD_OPTIONS.map((mood) => (
          <button
            key={mood.value}
            type="button"
            disabled={saving}
            onClick={() => onSelect(mood.value)}
            className={`flex min-h-16 min-w-0 flex-col items-center gap-2 rounded-lg border px-1 py-3 transition-all duration-150 active:scale-90 disabled:opacity-60 disabled:active:scale-100 ${
              selectedMood === mood.value
                ? 'border-primary bg-primary-soft scale-105'
                : 'border-border bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <span className="text-2xl">{mood.emoji}</span>
            <span className="text-center text-xs leading-tight text-muted-foreground">
              {mood.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
