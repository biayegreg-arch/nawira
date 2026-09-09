import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './system-prompt';

describe('buildSystemPrompt', () => {
  it('is stable — never depends on arguments, required for prompt caching (spec §3.1)', () => {
    expect(buildSystemPrompt()).toBe(buildSystemPrompt());
  });

  it('includes every absolute prohibition from PRD §6.5', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('Ne pose jamais de diagnostic');
    expect(prompt).toContain('Ne prescris jamais de traitement ni de dose de médicament');
    expect(prompt).toContain("N'affirme jamais qu'une utilisatrice est enceinte");
    expect(prompt).toContain('jours sans risque');
    expect(prompt).toContain('jours sûrs');
    expect(prompt).toContain('Ne garantis jamais une conception');
  });

  it('includes the emergency escalation instruction', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toContain('urgence');
    expect(prompt.toLowerCase()).toContain('professionnel de santé');
  });

  it('instructs responding in French', () => {
    expect(buildSystemPrompt()).toContain('en français');
  });
});
