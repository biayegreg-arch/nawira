import 'server-only';

export const SAFE_FALLBACK_MESSAGE =
  "Je ne peux pas répondre à cette question de cette façon. Pour ce sujet, je te recommande d'en parler à un professionnel de santé qui pourra te conseiller avec précision.";

// Pregnancy affirmation: bare "tu es enceinte" or an OVER-asserted variant
// ("certainement"/"sûrement"/"définitivement"). Deliberately does NOT match
// hedged phrasings ("probablement", "peut-être") — those are the
// PRD-compliant way to recommend a pregnancy test without affirming one
// (spec §3.2).
const PREGNANCY_ASSERTION =
  /\btu\s+es\s+(certainement\s+|sûrement\s+|définitivement\s+)?enceinte\b/i;

// Dosage instructions: a taking-verb + a quantity + a unit.
const DOSAGE_INSTRUCTION =
  /\b(prends?|prenez|dose\s+de)\s+\d+\s?(mg|ml|comprim[ée]s?|g[ée]lules?)\b/i;

// "Safe days" / "safe day" claims — PRD §8's contraceptive-marketing
// restriction. Known limitation: matches regardless of negation (a correct
// "there are NO safe days" answer would also be flagged) — accepted,
// over-flagging is the safe failure mode here.
const SAFE_DAYS_PLURAL = /\bjours?\s+sans\s+risque\b/i;
const SAFE_DAY_SINGULAR = /\bjour\s+sûr\b/i;

// A small curated list of assertive diagnosis phrasings — deliberately
// narrow (only "tu as X" / "cela confirme que tu as/souffres"), so a
// properly hedged informational answer ("peut avoir plusieurs causes
// possibles, comme X") never matches.
const DIAGNOSIS_ASSERTION = /\btu\s+as\s+(de\s+l'|du\s+|un\s+|une\s+)?(endométriose|sopk|kyste)\b/i;
const DIAGNOSIS_CONFIRMATION = /\bcela\s+confirme\s+que\s+tu\s+(as|souffres)\b/i;

const RED_LINE_PATTERNS: RegExp[] = [
  PREGNANCY_ASSERTION,
  DOSAGE_INSTRUCTION,
  SAFE_DAYS_PLURAL,
  SAFE_DAY_SINGULAR,
  DIAGNOSIS_ASSERTION,
  DIAGNOSIS_CONFIRMATION,
];

/**
 * Rule-based defensive net, spec §3.2 — never a replacement for the system
 * prompt (system-prompt.ts), a filter of last resort. Any match replaces
 * the ENTIRE response, never a surgical edit of the flagged sentence
 * (partial redaction risks a nonsensical half-sentence reaching the user).
 */
export function filterAssistantOutput(text: string): string {
  for (const pattern of RED_LINE_PATTERNS) {
    if (pattern.test(text)) return SAFE_FALLBACK_MESSAGE;
  }
  return text;
}
