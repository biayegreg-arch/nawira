/**
 * Where a notification should navigate to when clicked, or null when it is
 * informational only. `data` comes from the API as `unknown` — validate it.
 */
export function notificationHref(type: string, data: unknown): string | null {
  if (type !== 'SUPPORT_TICKET_REPLIED') return null;
  if (typeof data !== 'object' || data === null) return null;
  const ticketId = (data as Record<string, unknown>).ticketId;
  if (typeof ticketId !== 'string' || ticketId.length === 0) return null;
  return `/app/support/${encodeURIComponent(ticketId)}`;
}
