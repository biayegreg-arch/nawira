import { describe, it, expect } from 'vitest';
import { filterAssistantOutput, SAFE_FALLBACK_MESSAGE } from './output-filter';

describe('filterAssistantOutput', () => {
  it('flags a bare pregnancy assertion', () => {
    expect(filterAssistantOutput('Tu es enceinte, félicitations !')).toBe(SAFE_FALLBACK_MESSAGE);
  });

  it('does NOT flag a hedged pregnancy-test recommendation', () => {
    const text =
      'Tu es peut-être enceinte, je te recommande de faire un test de grossesse pour confirmer.';
    expect(filterAssistantOutput(text)).toBe(text);
  });

  it('flags dosage instructions', () => {
    expect(filterAssistantOutput('Prends 2 comprimés de paracétamol toutes les 6 heures.')).toBe(
      SAFE_FALLBACK_MESSAGE,
    );
  });

  it('does NOT flag a general, dose-free pain suggestion', () => {
    const text =
      'Tu peux prendre un antidouleur léger si besoin, mais consulte un médecin si la douleur persiste.';
    expect(filterAssistantOutput(text)).toBe(text);
  });

  it('flags a "safe days" claim', () => {
    expect(filterAssistantOutput('Voici tes jours sans risque ce mois-ci.')).toBe(
      SAFE_FALLBACK_MESSAGE,
    );
  });

  it('flags an assertive diagnosis phrasing', () => {
    expect(filterAssistantOutput("Tu as de l'endométriose, c'est certain.")).toBe(
      SAFE_FALLBACK_MESSAGE,
    );
  });

  it('does NOT flag a hedged, non-diagnostic mention of possible causes', () => {
    const text =
      "Des douleurs pelviennes peuvent avoir plusieurs causes possibles, comme des kystes ou de l'endométriose — seul un médecin peut poser un diagnostic après examen.";
    expect(filterAssistantOutput(text)).toBe(text);
  });

  it('does NOT flag a benign, general answer', () => {
    const text =
      "Le cycle menstruel dure généralement entre 21 et 35 jours, ça varie d'une personne à l'autre.";
    expect(filterAssistantOutput(text)).toBe(text);
  });
});
