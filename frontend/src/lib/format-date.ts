/** Formats an ISO date (`YYYY-MM-DD`) as a long French date, e.g. "10 septembre 2026". */
export function formatFrenchDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}
