const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Formats an ISO datetime as a short relative French duration, e.g. "il y a 2 h". */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < MS_PER_MINUTE) return "à l'instant";
  if (diff < MS_PER_HOUR) return `il y a ${Math.floor(diff / MS_PER_MINUTE)} min`;
  if (diff < MS_PER_DAY) return `il y a ${Math.floor(diff / MS_PER_HOUR)} h`;
  const days = Math.floor(diff / MS_PER_DAY);
  if (days < 7) return `il y a ${days} j`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(iso));
}
