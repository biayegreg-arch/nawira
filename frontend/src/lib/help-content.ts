import type { LucideIcon } from 'lucide-react';
import { Rocket, Droplet, Activity, Shield } from 'lucide-react';

export interface HelpQuestion {
  q: string;
  a: string;
}

export interface HelpCategory {
  title: string;
  icon: LucideIcon;
  colorClass: string;
  bgClass: string;
  questions: HelpQuestion[];
}

// Real, cautious, non-diagnostic FAQ copy (no fabricated read-counts, no
// dead links) — see .planning/banani/help-center.md for the sourcing
// rationale. Fertility/conception content intentionally omitted: no such
// feature exists yet (E5).
export const HELP_CATEGORIES: HelpCategory[] = [
  {
    title: 'Démarrage',
    icon: Rocket,
    colorClass: 'text-primary',
    bgClass: 'bg-primary-soft',
    questions: [
      {
        q: 'Créer mon compte NAWIRA',
        a: 'Inscris-toi avec ton email et un mot de passe (ou connecte-toi avec Google). Un code de vérification à 8 caractères t’est envoyé par email pour confirmer ton adresse avant d’accéder à l’application.',
      },
      {
        q: 'Configurer mon premier cycle',
        a: 'Lors de l’inscription, l’onboarding te demande la date de tes dernières règles ainsi que la durée habituelle de ton cycle et de tes règles, si tu les connais. NAWIRA affine ensuite ses estimations au fil de tes saisies.',
      },
      {
        q: 'Enregistrer mes règles au quotidien',
        a: 'Sur l’écran Accueil, appuie sur « Mes règles ont commencé » le jour où elles débutent. NAWIRA reconstruit automatiquement tes cycles à partir de ces saisies.',
      },
    ],
  },
  {
    title: 'Cycle menstruel',
    icon: Droplet,
    colorClass: 'text-rose',
    bgClass: 'bg-rose-soft',
    questions: [
      {
        q: 'Comprendre les phases du cycle',
        a: 'Un cycle se compte du premier jour des règles jusqu’à la veille des règles suivantes. Sa durée varie normalement entre 21 et 35 jours selon les personnes, et peut fluctuer d’un cycle à l’autre.',
      },
      {
        q: 'Pourquoi mon cycle peut sembler irrégulier',
        a: 'De nombreux facteurs (stress, sommeil, poids, activité physique, certains traitements) peuvent faire varier la durée d’un cycle. Si l’irrégularité persiste sur plusieurs cycles, on te recommande d’en parler à un professionnel de santé.',
      },
      {
        q: 'Quelle est la durée normale d’un cycle ?',
        a: 'La plupart des cycles durent entre 21 et 35 jours. NAWIRA affiche une estimation basée sur tes cycles précédemment enregistrés — plus tu as d’historique, plus l’estimation est fiable.',
      },
    ],
  },
  {
    title: 'Symptômes et bien-être',
    icon: Activity,
    colorClass: 'text-amber',
    bgClass: 'bg-amber-soft',
    questions: [
      {
        q: 'Gérer les crampes menstruelles',
        a: 'La chaleur (bouillotte), le repos et une activité physique douce peuvent aider à soulager l’inconfort. Si les douleurs sont intenses ou t’empêchent de mener tes activités habituelles, consulte un professionnel de santé.',
      },
      {
        q: 'Comprendre le syndrome prémenstruel (SPM)',
        a: 'Le SPM regroupe des symptômes physiques et émotionnels (fatigue, sensibilité, changements d’humeur) qui peuvent apparaître avant les règles. NAWIRA ne pose pas de diagnostic — si ces symptômes affectent significativement ton quotidien, un professionnel de santé pourra t’accompagner.',
      },
    ],
  },
  {
    title: 'Compte et données',
    icon: Shield,
    colorClass: 'text-purple',
    bgClass: 'bg-purple-soft',
    questions: [
      {
        q: 'Comment mes données sont-elles protégées ?',
        a: 'Tes données sont chiffrées et hébergées de façon sécurisée. Elles ne sont jamais partagées à des fins commerciales.',
      },
      {
        q: 'Puis-je modifier mes informations de profil ?',
        a: 'Pas encore dans cette version : tes informations (date de naissance, objectif, durée de cycle déclarée) sont affichées sur ton profil mais pas encore modifiables directement dans l’application. Cette fonctionnalité arrive prochainement.',
      },
    ],
  },
];
