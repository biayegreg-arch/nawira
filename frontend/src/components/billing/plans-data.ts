// Real PRD §3 pricing + §3.1 entitlement matrix — not Banani's fictional
// Euro pricing / fictional "Pro" plan. Matches Profile.plan's real
// FREE | PLUS | BABY enum.
export interface BillingPlan {
  key: 'FREE' | 'PLUS' | 'BABY';
  name: string;
  promise: string;
  priceFcfa: number;
  features: string[];
  highlighted: boolean;
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    key: 'FREE',
    name: 'Free',
    promise: 'Suivre',
    priceFcfa: 0,
    features: [
      'Règles et calendrier',
      'Estimation basique de la fenêtre fertile',
      'Symptômes essentiels',
      'Historique sur 3 cycles',
    ],
    highlighted: false,
  },
  {
    key: 'PLUS',
    name: 'NAWIRA Plus',
    promise: 'Comprendre',
    priceFcfa: 1000,
    features: [
      'Tout du plan Free',
      'Historique de cycles illimité',
      'Symptômes complets',
      'Fenêtre fertile enrichie (historique)',
      'Cycle Score et rapport de cycle',
      'Assistant NAWIRA',
    ],
    highlighted: true,
  },
  {
    key: 'BABY',
    name: 'Projet Bébé',
    promise: 'Accompagner un objectif',
    priceFcfa: 2500,
    features: [
      'Tout du plan NAWIRA Plus',
      'Température basale',
      'Glaire cervicale',
      'Test LH',
      'Parcours de conception enrichi',
    ],
    highlighted: false,
  },
];

export const PLAN_LABELS: Record<BillingPlan['key'], string> = {
  FREE: 'Free',
  PLUS: 'NAWIRA Plus',
  BABY: 'Projet Bébé',
};
