import { describe, expect, it } from 'vitest';
import { notificationHref } from './notification-target';

describe('notificationHref', () => {
  it('links support replies to their ticket', () => {
    expect(notificationHref('SUPPORT_TICKET_REPLIED', { ticketId: 'abc123' })).toBe(
      '/app/support/abc123',
    );
  });

  it('returns null for missing, empty or non-string ticketId', () => {
    expect(notificationHref('SUPPORT_TICKET_REPLIED', {})).toBeNull();
    expect(notificationHref('SUPPORT_TICKET_REPLIED', null)).toBeNull();
    expect(notificationHref('SUPPORT_TICKET_REPLIED', { ticketId: '' })).toBeNull();
    expect(notificationHref('SUPPORT_TICKET_REPLIED', { ticketId: 42 })).toBeNull();
  });

  it('returns null for other types', () => {
    expect(notificationHref('WELCOME', { ticketId: 'abc123' })).toBeNull();
  });
});
