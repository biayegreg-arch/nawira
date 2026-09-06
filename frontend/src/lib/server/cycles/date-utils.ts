import 'server-only';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `a` to `b` (positive if `b` is after `a`). Both dates must be UTC-midnight `@db.Date`-style values. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Returns a new Date `days` days after `date` (negative `days` goes backward). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Today's date at UTC midnight — matches how Prisma reads/writes `@db.Date` columns. */
export function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
