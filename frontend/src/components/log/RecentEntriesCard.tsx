import { formatFrenchDate } from '@/lib/format-date';
import { MOOD_EMOJI, MOOD_LABELS, SYMPTOM_LABELS } from '@/lib/daily-log-labels';

export interface RecentEntry {
  date: string;
  mood: string | null;
  symptoms: string[];
}

interface RecentEntriesCardProps {
  entries: RecentEntry[];
}

function summarize(entry: RecentEntry): string {
  const moodPart = entry.mood ? MOOD_LABELS[entry.mood] : null;
  const symptomPart =
    entry.symptoms.length > 0
      ? entry.symptoms.map((s) => SYMPTOM_LABELS[s] ?? s).join(', ')
      : 'Aucun symptôme';
  return moodPart ? `${moodPart} — ${symptomPart}` : symptomPart;
}

function shortDate(iso: string): string {
  return formatFrenchDate(iso).replace(/ \d{4}$/, '');
}

export function RecentEntriesCard({ entries }: RecentEntriesCardProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <h3 className="mb-3 text-base font-bold text-navy">Dernières saisies</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune saisie récente.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <div key={entry.date} className="flex items-start gap-3">
              <span className="shrink-0 text-lg">{entry.mood ? MOOD_EMOJI[entry.mood] : '📝'}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-navy">{shortDate(entry.date)}</div>
                <div className="mt-0.5 text-xs break-words text-muted-foreground">
                  {summarize(entry)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
