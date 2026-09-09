import { describe, it, expect } from 'vitest';
import { classifyIntent } from './intent-classifier';

describe('classifyIntent', () => {
  it('classifies a delayed-period question', () => {
    expect(classifyIntent("Mes règles ont deux jours de retard, c'est normal ?")).toBe(
      'DELAYED_PERIOD',
    );
  });

  it('classifies a pain question', () => {
    expect(classifyIntent("J'ai très mal au ventre depuis ce matin.")).toBe('PAIN');
  });

  it('classifies a contraception question', () => {
    expect(classifyIntent('Quelle contraception me recommandes-tu ?')).toBe('CONTRACEPTION');
  });

  it('classifies a baby-project question', () => {
    expect(classifyIntent("On essaie d'avoir un bébé, tu peux m'aider ?")).toBe('BABY_PROJECT');
  });

  it('classifies a "my data" question', () => {
    expect(classifyIntent('Peux-tu analyser mes derniers cycles ?')).toBe('MY_DATA');
  });

  it('classifies a general cycle-info question', () => {
    expect(classifyIntent("C'est quoi la phase lutéale ?")).toBe('CYCLE_INFO');
  });

  it('falls back to OTHER when nothing matches', () => {
    expect(classifyIntent("Quel temps fait-il aujourd'hui ?")).toBe('OTHER');
  });
});
