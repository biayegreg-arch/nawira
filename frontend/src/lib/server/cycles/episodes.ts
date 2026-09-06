import 'server-only';
import { daysBetween } from './date-utils';

export interface Episode {
  start: Date;
  end: Date;
  length: number;
}

/**
 * Groups sorted, ascending, unique dates into contiguous-date episodes.
 * A gap of more than 1 day between two dates starts a new episode.
 * Caller must pass dates already sorted ascending (e.g. from a Prisma
 * `orderBy: { date: 'asc' }` query).
 */
export function groupIntoEpisodes(sortedDates: Date[]): Episode[] {
  if (sortedDates.length === 0) return [];

  const episodes: Episode[] = [];
  let start = sortedDates[0]!;
  let end = sortedDates[0]!;

  for (let i = 1; i < sortedDates.length; i++) {
    const current = sortedDates[i]!;
    if (daysBetween(end, current) === 1) {
      end = current;
    } else {
      episodes.push({ start, end, length: daysBetween(start, end) + 1 });
      start = current;
      end = current;
    }
  }
  episodes.push({ start, end, length: daysBetween(start, end) + 1 });

  return episodes;
}
