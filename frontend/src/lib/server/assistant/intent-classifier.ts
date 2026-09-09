import 'server-only';

export type IntentCategory =
  | 'CYCLE_INFO'
  | 'MY_DATA'
  | 'DELAYED_PERIOD'
  | 'PAIN'
  | 'CONTRACEPTION'
  | 'BABY_PROJECT'
  | 'OTHER';

// Ordered most-specific first — MY_DATA's "mes cycles"/"mes derniers cycles"
// must be checked before CYCLE_INFO's generic "cycle" keyword, or a "my
// data" question would be misclassified as generic cycle info.
const KEYWORD_RULES: Array<{ category: IntentCategory; keywords: string[] }> = [
  { category: 'DELAYED_PERIOD', keywords: ['retard'] },
  { category: 'PAIN', keywords: ['douleur', 'mal au ventre', 'crampes', 'ça fait mal'] },
  { category: 'CONTRACEPTION', keywords: ['contraception', 'pilule', 'préservatif', 'stérilet'] },
  {
    category: 'BABY_PROJECT',
    keywords: ['bébé', 'grossesse', 'conception', 'projet bébé', 'tomber enceinte'],
  },
  {
    category: 'MY_DATA',
    keywords: ['mes données', 'mon historique', 'mes derniers cycles', 'mes cycles'],
  },
  { category: 'CYCLE_INFO', keywords: ['cycle', 'règles', 'ovulation', 'phase'] },
];

/**
 * Coarse, keyword-based classification — feeds `AssistantMessage.intentCategory`
 * only (spec §7, §9). No LLM call: a second API call to classify intent
 * would double cost for no product value, and this only backs a future
 * analytics pass, not a guardrail decision (guardrails come from the system
 * prompt + output filter regardless of classified intent).
 */
export function classifyIntent(message: string): IntentCategory {
  const normalized = message.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) return rule.category;
  }
  return 'OTHER';
}
