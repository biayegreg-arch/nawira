import { describe, it, expect } from 'vitest';
import {
  periodReminder,
  journalReminder,
  weeklySummaryReady,
  fertilityWindowApproaching,
  supportTicketReplied,
} from './templates';

describe('periodReminder', () => {
  it('builds the NORMAL copy with a dedupeKey keyed to expectedPeriodStart', () => {
    const result = periodReminder('user_1', 'NORMAL', new Date('2026-09-21'));
    expect(result).toEqual({
      userId: 'user_1',
      type: 'PERIOD_REMINDER',
      title: 'Règles à venir',
      body: 'Tes règles sont estimées dans environ 3 jours.',
      dedupeKey: 'period-reminder:user_1:2026-09-21',
    });
  });

  it('builds the DISCREET copy with a generic title', () => {
    const result = periodReminder('user_1', 'DISCREET', new Date('2026-09-21'));
    expect(result.title).toBe('NAWIRA');
    expect(result.body).toBe('Ton rappel personnel est disponible.');
    expect(result.dedupeKey).toBe('period-reminder:user_1:2026-09-21');
  });
});

describe('journalReminder', () => {
  it('builds the NORMAL copy with a dedupeKey keyed to today', () => {
    const result = journalReminder('user_1', 'NORMAL', new Date('2026-09-14'));
    expect(result).toEqual({
      userId: 'user_1',
      type: 'JOURNAL_REMINDER',
      title: 'Ton journal du jour',
      body: "Comment te sens-tu aujourd'hui ?",
      dedupeKey: 'journal-reminder:user_1:2026-09-14',
    });
  });

  it('builds the DISCREET copy with a generic title', () => {
    const result = journalReminder('user_1', 'DISCREET', new Date('2026-09-14'));
    expect(result.title).toBe('NAWIRA');
    expect(result.body).toBe('Un rappel NAWIRA est disponible.');
  });
});

describe('weeklySummaryReady', () => {
  it('builds the NORMAL copy with a dedupeKey keyed to the given week', () => {
    const result = weeklySummaryReady('user_1', 'NORMAL', new Date('2026-09-14'));
    expect(result).toEqual({
      userId: 'user_1',
      type: 'WEEKLY_SUMMARY',
      title: 'Ton résumé est prêt',
      body: 'Ton résumé de cycle est prêt.',
      dedupeKey: 'weekly-summary:user_1:2026-09-14',
    });
  });

  it('builds the DISCREET copy with a generic title', () => {
    const result = weeklySummaryReady('user_1', 'DISCREET', new Date('2026-09-14'));
    expect(result.title).toBe('NAWIRA');
    expect(result.body).toBe('Ton nouveau résumé est disponible.');
  });
});

describe('fertilityWindowApproaching', () => {
  it('builds the NORMAL copy with a dedupeKey keyed to fertileWindowStart', () => {
    const result = fertilityWindowApproaching('user_1', 'NORMAL', new Date('2026-09-02'));
    expect(result).toEqual({
      userId: 'user_1',
      type: 'FERTILITY_REMINDER',
      title: 'Fenêtre fertile',
      body: 'Ta fenêtre fertile estimée approche.',
      dedupeKey: 'fertility-reminder:user_1:2026-09-02',
    });
  });

  it('builds the DISCREET copy with a generic title', () => {
    const result = fertilityWindowApproaching('user_1', 'DISCREET', new Date('2026-09-02'));
    expect(result.title).toBe('NAWIRA');
    expect(result.body).toBe('Un rappel Projet Bébé est disponible.');
  });
});

describe('supportTicketReplied', () => {
  it('returns a CreateNotificationInput keyed by messageId for dedup', () => {
    const input = supportTicketReplied('user_1', 'ticket_1', 'msg_1');
    expect(input).toMatchObject({
      userId: 'user_1',
      type: 'SUPPORT_TICKET_REPLIED',
      dedupeKey: 'support-ticket-reply:msg_1',
      data: { ticketId: 'ticket_1' },
    });
    expect(input.title.length).toBeGreaterThan(0);
    expect(input.body.length).toBeGreaterThan(0);
  });
});
